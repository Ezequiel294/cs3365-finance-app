import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import { HttpApi, HttpMethod, HttpStage } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpUserPoolAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { AccountRecovery, FeaturePlan, UserPool, UserPoolClient } from "aws-cdk-lib/aws-cognito";
import type { Table } from "aws-cdk-lib/aws-dynamodb";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Architecture, Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat, type NodejsFunctionProps } from "aws-cdk-lib/aws-lambda-nodejs";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { BlockPublicAccess, Bucket, BucketEncryption, EventType, HttpMethods } from "aws-cdk-lib/aws-s3";
import { LambdaDestination } from "aws-cdk-lib/aws-s3-notifications";
import type { Construct } from "constructs";
import { join } from "node:path";
import type { DataStack } from "./data-stack";

export interface ApiStackProps extends StackProps {
  data: DataStack;
  /** Root of the npm workspace (agent-a/). */
  workspaceRoot: string;
}

export const BCCR_PARAM_PREFIX = "/FinanceApp/bccr";
export const PRICE_API_KEY_PARAM = "/FinanceApp/prices/apiKey";

/**
 * FinanceAppApi: Cognito, the private raw-ingest bucket, ApiFn and ImportWorkerFn (one code bundle),
 * and the HTTP API with a Cognito JWT authorizer on `/api/*`. `/ingest/gmail*` authenticates the
 * hashed ingest token inside ApiFn instead.
 */
export class ApiStack extends Stack {
  readonly apiUrl: string;
  readonly userPool: UserPool;
  readonly userPoolClient: UserPoolClient;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);
    const { data } = props;

    this.userPool = new UserPool(this, "Users", {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: { email: { required: true, mutable: true } },
      passwordPolicy: { minLength: 8, requireLowercase: true, requireUppercase: true, requireDigits: true, requireSymbols: true },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      featurePlan: FeaturePlan.LITE,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    this.userPoolClient = this.userPool.addClient("WebClient", {
      authFlows: { userPassword: true },
      generateSecret: false,
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
      idTokenValidity: Duration.hours(1),
      accessTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30),
    });

    const rawBucket = new Bucket(this, "RawIngest", {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
      lifecycleRules: [
        { prefix: "raw/", expiration: Duration.days(30) },
        { prefix: "imports/", expiration: Duration.days(30) },
        { abortIncompleteMultipartUploadAfter: Duration.days(1) },
      ],
      // The browser uploads statements straight to S3 with a presigned POST from the CloudFront origin.
      cors: [
        {
          allowedMethods: [HttpMethods.POST],
          allowedOrigins: ["https://*.cloudfront.net", "http://localhost:3000"],
          allowedHeaders: ["*"],
          maxAge: 3000,
        },
      ],
    });

    const httpApi = new HttpApi(this, "HttpApi", { createDefaultStage: false, description: "Finance app API" });
    new HttpStage(this, "DefaultStage", {
      httpApi,
      stageName: "$default",
      autoDeploy: true,
      throttle: { rateLimit: 50, burstLimit: 100 },
    });
    this.apiUrl = httpApi.apiEndpoint;

    const tables: Record<string, Table> = {
      TRANSACTIONS_TABLE: data.transactions,
      INVESTMENT_TX_TABLE: data.investmentTx,
      AGGREGATES_TABLE: data.aggregates,
      REFERENCE_TABLE: data.reference,
      INGESTION_TABLE: data.ingestion,
    };
    const environment: Record<string, string> = {
      ...Object.fromEntries(Object.entries(tables).map(([k, t]) => [k, t.tableName])),
      RAW_BUCKET: rawBucket.bucketName,
      BCCR_PARAM_PREFIX,
      PRICE_API_KEY_PARAM,
      INGEST_BASE_URL: httpApi.apiEndpoint,
      NODE_OPTIONS: "--enable-source-maps",
    };

    // Both functions are built from the same entry with the same options, so they share one asset.
    const bundle = (name: string, handler: string, extra: Partial<NodejsFunctionProps>) =>
      new NodejsFunction(this, name, {
        entry: join(props.workspaceRoot, "api", "src", "index.ts"),
        handler,
        projectRoot: props.workspaceRoot,
        depsLockFilePath: join(props.workspaceRoot, "package-lock.json"),
        runtime: Runtime.NODEJS_24_X,
        architecture: Architecture.ARM_64,
        environment,
        logGroup: new LogGroup(this, `${name}Logs`, { retention: RetentionDays.ONE_MONTH, removalPolicy: RemovalPolicy.DESTROY }),
        bundling: { format: OutputFormat.CJS, minify: true, sourceMap: true, target: "node24", externalModules: [] },
        ...extra,
      });

    const apiFn = bundle("ApiFn", "apiHandler", { memorySize: 512, timeout: Duration.seconds(29), description: "Finance app API (router, services, email ingest)" });
    const workerFn = bundle("ImportWorkerFn", "importWorkerHandler", { memorySize: 1024, timeout: Duration.minutes(5), description: "Finance app CSV statement import" });

    for (const t of Object.values(tables)) t.grantReadWriteData(apiFn);
    for (const t of [data.transactions, data.aggregates, data.reference, data.ingestion]) t.grantReadWriteData(workerFn);
    rawBucket.grantPut(apiFn, "raw/*");
    rawBucket.grantPut(apiFn, "imports/*"); // presigned POSTs are signed with this role
    rawBucket.grantRead(apiFn, "raw/*");
    rawBucket.grantRead(workerFn, "imports/*");

    const ssmRead = new PolicyStatement({
      actions: ["ssm:GetParameter", "ssm:GetParameters"],
      resources: [
        this.formatArn({ service: "ssm", resource: "parameter", resourceName: `${BCCR_PARAM_PREFIX.slice(1)}/*` }),
        this.formatArn({ service: "ssm", resource: "parameter", resourceName: PRICE_API_KEY_PARAM.slice(1) }),
      ],
    });
    const decryptViaSsm = new PolicyStatement({
      actions: ["kms:Decrypt"],
      resources: ["*"],
      conditions: { StringEquals: { "kms:ViaService": `ssm.${this.region}.amazonaws.com` } },
    });
    for (const fn of [apiFn, workerFn]) {
      fn.addToRolePolicy(ssmRead);
      fn.addToRolePolicy(decryptViaSsm);
    }

    rawBucket.addEventNotification(EventType.OBJECT_CREATED, new LambdaDestination(workerFn), { prefix: "imports/", suffix: ".csv" });

    const authorizer = new HttpUserPoolAuthorizer("CognitoJwt", this.userPool, { userPoolClients: [this.userPoolClient] });
    const integration = new HttpLambdaIntegration("ApiFnIntegration", apiFn);
    httpApi.addRoutes({ path: "/api/{proxy+}", methods: [HttpMethod.ANY], integration, authorizer });
    httpApi.addRoutes({ path: "/ingest/gmail/config", methods: [HttpMethod.GET], integration });
    httpApi.addRoutes({ path: "/ingest/gmail", methods: [HttpMethod.POST], integration });
    httpApi.addRoutes({ path: "/ingest/gmail/heartbeat", methods: [HttpMethod.POST], integration });

    new CfnOutput(this, "ApiUrl", { value: httpApi.apiEndpoint });
    new CfnOutput(this, "UserPoolId", { value: this.userPool.userPoolId });
    new CfnOutput(this, "UserPoolClientId", { value: this.userPoolClient.userPoolClientId });
    new CfnOutput(this, "RawBucketName", { value: rawBucket.bucketName });
    new CfnOutput(this, "ApiFunctionName", { value: apiFn.functionName });
  }
}
