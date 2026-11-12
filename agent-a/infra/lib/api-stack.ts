import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import { CfnStage, HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpUserPoolAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { AccountRecovery, FeaturePlan, UserPool, UserPoolClient } from 'aws-cdk-lib/aws-cognito';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Architecture, Code, Function as LambdaFunction, Runtime } from 'aws-cdk-lib/aws-lambda';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { BlockPublicAccess, Bucket, BucketEncryption, EventType, ObjectOwnership } from 'aws-cdk-lib/aws-s3';
import { LambdaDestination } from 'aws-cdk-lib/aws-s3-notifications';
import type { Construct } from 'constructs';
// @ts-expect-error plain ESM build script without type declarations
import { buildApi } from '../../api/build.mjs';
import type { DataTables } from './data-stack';

export interface ApiStackProps extends StackProps {
  tables: DataTables;
}

const BCCR_PREFIX = '/FinanceApp/bccr/';
const TWELVE_DATA_KEY_PARAM = '/FinanceApp/prices/twelvedata-api-key';

/** FinanceAppApi: HTTP API with a Cognito JWT authorizer, ApiFn, ImportWorkerFn, the raw-ingest bucket, and Cognito. */
export class ApiStack extends Stack {
  readonly apiUrl: string;
  readonly userPool: UserPool;
  readonly userPoolClient: UserPoolClient;
  readonly rawBucket: Bucket;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);
    const { tables } = props;

    // ---------- Identity ----------
    this.userPool = new UserPool(this, 'UserPool', {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: { email: { required: true, mutable: true } },
      passwordPolicy: { minLength: 10, requireLowercase: true, requireDigits: true, requireUppercase: false, requireSymbols: false },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      featurePlan: FeaturePlan.LITE,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    this.userPoolClient = this.userPool.addClient('WebClient', {
      authFlows: { userPassword: true },
      generateSecret: false,
      preventUserExistenceErrors: true,
      idTokenValidity: Duration.hours(1),
      accessTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30),
    });

    // ---------- Raw-ingest bucket (private, lifecycle expiry) ----------
    // The CORS rule needs the CloudFront domain, so the web stack sets it (avoids a stack cycle).
    this.rawBucket = new Bucket(this, 'RawIngest', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
      lifecycleRules: [{ expiration: Duration.days(90) }],
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // ---------- One code bundle, two Lambdas ----------
    const code = Code.fromAsset(buildApi());
    const environment = {
      TRANSACTIONS_TABLE: tables.transactions.tableName,
      INVESTMENT_TX_TABLE: tables.investmentTx.tableName,
      AGGREGATES_TABLE: tables.aggregates.tableName,
      REFERENCE_TABLE: tables.reference.tableName,
      INGESTION_TABLE: tables.ingestion.tableName,
      RAW_BUCKET: this.rawBucket.bucketName,
      BCCR_PARAM_PREFIX: BCCR_PREFIX,
      TWELVE_DATA_KEY_PARAM,
      NODE_OPTIONS: '--enable-source-maps',
    };
    const ssmRead = new PolicyStatement({
      actions: ['ssm:GetParameter', 'ssm:GetParameters'],
      resources: [
        `arn:aws:ssm:${this.region}:${this.account}:parameter/FinanceApp/bccr/*`,
        `arn:aws:ssm:${this.region}:${this.account}:parameter/FinanceApp/prices/*`,
      ],
    });

    const apiFn = new LambdaFunction(this, 'ApiFn', {
      runtime: Runtime.NODEJS_24_X,
      architecture: Architecture.ARM_64,
      handler: 'index.apiHandler',
      code,
      memorySize: 1024,
      timeout: Duration.seconds(29),
      environment,
      logGroup: new LogGroup(this, 'ApiFnLogs', { retention: RetentionDays.ONE_MONTH, removalPolicy: RemovalPolicy.DESTROY }),
    });
    const worker = new LambdaFunction(this, 'ImportWorkerFn', {
      runtime: Runtime.NODEJS_24_X,
      architecture: Architecture.ARM_64,
      handler: 'index.importWorkerHandler',
      code,
      memorySize: 1024,
      timeout: Duration.minutes(5),
      environment,
      logGroup: new LogGroup(this, 'ImportWorkerFnLogs', { retention: RetentionDays.ONE_MONTH, removalPolicy: RemovalPolicy.DESTROY }),
    });

    for (const fn of [apiFn, worker]) {
      for (const t of Object.values(tables)) t.grantReadWriteData(fn);
      fn.addToRolePolicy(ssmRead);
    }
    this.rawBucket.grantReadWrite(apiFn);
    this.rawBucket.grantRead(worker);
    this.rawBucket.addEventNotification(EventType.OBJECT_CREATED, new LambdaDestination(worker), {
      prefix: 'imports/',
      suffix: '.csv',
    });

    // ---------- HTTP API ----------
    const httpApi = new HttpApi(this, 'HttpApi', { createDefaultStage: true });
    const integration = new HttpLambdaIntegration('ApiFnIntegration', apiFn);
    const authorizer = new HttpUserPoolAuthorizer('CognitoJwt', this.userPool, {
      userPoolClients: [this.userPoolClient],
    });
    httpApi.addRoutes({ path: '/api/{proxy+}', methods: [HttpMethod.ANY], integration, authorizer });
    // The Gmail script's routes: no Cognito; ApiFn checks the hashed ingest token.
    httpApi.addRoutes({ path: '/ingest/gmail', methods: [HttpMethod.POST], integration });
    httpApi.addRoutes({ path: '/ingest/gmail/config', methods: [HttpMethod.GET], integration });
    httpApi.addRoutes({ path: '/ingest/gmail/heartbeat', methods: [HttpMethod.POST], integration });

    const accessLogs = new LogGroup(this, 'HttpApiAccessLogs', {
      retention: RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const stage = httpApi.defaultStage!.node.defaultChild as CfnStage;
    stage.defaultRouteSettings = { throttlingBurstLimit: 50, throttlingRateLimit: 25 };
    stage.accessLogSettings = {
      destinationArn: accessLogs.logGroupArn,
      format: JSON.stringify({
        requestId: '$context.requestId',
        routeKey: '$context.routeKey',
        status: '$context.status',
        latency: '$context.responseLatency',
        integrationError: '$context.integrationErrorMessage',
        authorizerError: '$context.authorizer.error',
      }),
    };

    this.apiUrl = httpApi.apiEndpoint;
    apiFn.addEnvironment('API_BASE_URL', httpApi.apiEndpoint);

    new CfnOutput(this, 'ApiUrl', { value: httpApi.apiEndpoint });
    new CfnOutput(this, 'UserPoolId', { value: this.userPool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', { value: this.userPoolClient.userPoolClientId });
    new CfnOutput(this, 'RawBucketName', { value: this.rawBucket.bucketName });
    new CfnOutput(this, 'ApiFnName', { value: apiFn.functionName });
    new CfnOutput(this, 'ImportWorkerFnName', { value: worker.functionName });
  }
}
