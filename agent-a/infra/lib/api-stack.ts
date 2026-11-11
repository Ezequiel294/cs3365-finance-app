import { join } from 'node:path';
import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import { CfnStage, HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpUserPoolAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { AccountRecovery, FeaturePlan, UserPool, UserPoolClient, UserPoolEmail, VerificationEmailStyle } from 'aws-cdk-lib/aws-cognito';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Architecture, Runtime, type IFunction } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { BlockPublicAccess, Bucket, BucketEncryption, EventType } from 'aws-cdk-lib/aws-s3';
import { LambdaDestination } from 'aws-cdk-lib/aws-s3-notifications';
import type { Construct } from 'constructs';
import type { DataStack } from './data-stack';

const ROOT = join(import.meta.dirname, '..', '..');
export const BCCR_PARAM_PREFIX = '/FinanceApp/bccr';
export const TWELVE_DATA_KEY_PARAM = '/FinanceApp/prices/twelvedata-api-key';

export interface ApiStackProps extends StackProps {
  data: DataStack;
}

/** API Gateway HTTP API + ApiFn, ImportWorkerFn (one bundle), Cognito, and the raw-ingest bucket. */
export class ApiStack extends Stack {
  readonly apiUrl: string;
  readonly userPool: UserPool;
  readonly userPoolClient: UserPoolClient;
  readonly rawBucket: Bucket;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);
    const { data } = props;

    // ---------- Cognito ----------
    this.userPool = new UserPool(this, 'UserPool', {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: { email: { required: true, mutable: true } },
      passwordPolicy: { minLength: 8, requireLowercase: true, requireUppercase: true, requireDigits: true, requireSymbols: false },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      email: UserPoolEmail.withCognito(),
      userVerification: {
        emailSubject: 'Your Finance App confirmation code',
        emailBody: 'Your Finance App confirmation code is {####}',
        emailStyle: VerificationEmailStyle.CODE,
      },
      featurePlan: FeaturePlan.LITE,
    });
    this.userPoolClient = this.userPool.addClient('WebClient', {
      authFlows: { userPassword: true },
      generateSecret: false,
      preventUserExistenceErrors: true,
      idTokenValidity: Duration.hours(1),
      accessTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30),
    });

    // ---------- Raw-ingest bucket (private; CORS is set by the web stack once the CloudFront domain exists) ----------
    this.rawBucket = new Bucket(this, 'RawIngest', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      lifecycleRules: [
        { id: 'expire-imports', prefix: 'imports/', expiration: Duration.days(30) },
        { id: 'expire-raw-emails', prefix: 'raw/', expiration: Duration.days(180) },
      ],
    });

    // ---------- Lambdas: one code bundle, two entry points ----------
    const environment = {
      TRANSACTIONS_TABLE: data.transactions.tableName,
      INVESTMENT_TX_TABLE: data.investmentTx.tableName,
      AGGREGATES_TABLE: data.aggregates.tableName,
      REFERENCE_TABLE: data.reference.tableName,
      INGESTION_TABLE: data.ingestion.tableName,
      RAW_BUCKET: this.rawBucket.bucketName,
      BCCR_PARAM_PREFIX,
      TWELVE_DATA_KEY_PARAM,
      NODE_OPTIONS: '--enable-source-maps',
    };
    const bundle = (handler: string, logicalId: string, memorySize: number, timeout: Duration) =>
      new NodejsFunction(this, logicalId, {
        entry: join(ROOT, 'api', 'src', 'index.ts'),
        handler,
        projectRoot: ROOT,
        depsLockFilePath: join(ROOT, 'package-lock.json'),
        runtime: Runtime.NODEJS_24_X,
        architecture: Architecture.ARM_64,
        memorySize,
        timeout,
        environment,
        logGroup: new LogGroup(this, `${logicalId}Logs`, { retention: RetentionDays.ONE_MONTH }),
        bundling: {
          format: OutputFormat.CJS,
          target: 'node24',
          minify: true,
          sourceMap: true,
          externalModules: [],
          loader: { '.gs': 'text' },
        },
      });

    const apiFn = bundle('apiHandler', 'ApiFn', 512, Duration.seconds(29));
    const workerFn = bundle('importWorkerHandler', 'ImportWorkerFn', 1024, Duration.minutes(15));

    for (const fn of [apiFn, workerFn]) {
      for (const table of [data.transactions, data.investmentTx, data.aggregates, data.reference, data.ingestion]) {
        table.grantReadWriteData(fn);
      }
      this.grantParameters(fn);
    }
    this.rawBucket.grantPut(apiFn, 'raw/*');
    this.rawBucket.grantRead(apiFn, 'raw/*');
    this.rawBucket.grantPut(apiFn, 'imports/*'); // the presigned POST is signed with ApiFn's role
    this.rawBucket.grantRead(workerFn, 'imports/*');

    this.rawBucket.addEventNotification(EventType.OBJECT_CREATED, new LambdaDestination(workerFn), {
      prefix: 'imports/',
      suffix: '.csv',
    });

    // ---------- HTTP API ----------
    // No CORS: browsers never call the API directly (the Next.js server and the Gmail script do).
    const httpApi = new HttpApi(this, 'HttpApi', {
      description: 'Finance app API (/api/* with Cognito JWT, /ingest/gmail* with ingest token)',
    });
    const stage = httpApi.defaultStage?.node.defaultChild as CfnStage;
    stage.defaultRouteSettings = { throttlingBurstLimit: 100, throttlingRateLimit: 50 };

    const integration = new HttpLambdaIntegration('ApiFnIntegration', apiFn);
    const authorizer = new HttpUserPoolAuthorizer('CognitoAuthorizer', this.userPool, { userPoolClients: [this.userPoolClient] });
    httpApi.addRoutes({
      path: '/api/{proxy+}',
      methods: [HttpMethod.GET, HttpMethod.POST, HttpMethod.PUT, HttpMethod.PATCH, HttpMethod.DELETE],
      integration,
      authorizer,
    });
    httpApi.addRoutes({ path: '/ingest/gmail', methods: [HttpMethod.POST], integration });
    httpApi.addRoutes({ path: '/ingest/gmail/config', methods: [HttpMethod.GET], integration });
    httpApi.addRoutes({ path: '/ingest/gmail/heartbeat', methods: [HttpMethod.POST], integration });

    this.apiUrl = httpApi.apiEndpoint;

    new CfnOutput(this, 'ApiUrl', { value: httpApi.apiEndpoint });
    new CfnOutput(this, 'UserPoolId', { value: this.userPool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', { value: this.userPoolClient.userPoolClientId });
    new CfnOutput(this, 'RawBucketName', { value: this.rawBucket.bucketName });
    new CfnOutput(this, 'ApiFunctionName', { value: apiFn.functionName });
    new CfnOutput(this, 'ImportWorkerFunctionName', { value: workerFn.functionName });
  }

  /** `ssm:GetParameter(s)` on `/FinanceApp/bccr/*` and `/FinanceApp/prices/*`, with decryption through SSM. */
  private grantParameters(fn: IFunction): void {
    const arn = (path: string) => this.formatArn({ service: 'ssm', resource: 'parameter', resourceName: path });
    fn.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['ssm:GetParameter', 'ssm:GetParameters'],
        resources: [arn('FinanceApp/bccr/*'), arn('FinanceApp/prices/*')],
      }),
    );
    fn.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['kms:Decrypt'],
        resources: ['*'],
        conditions: { StringEquals: { 'kms:ViaService': `ssm.${this.region}.amazonaws.com` } },
      }),
    );
  }
}
