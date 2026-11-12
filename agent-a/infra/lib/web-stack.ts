import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import type { CfnFunction } from 'aws-cdk-lib/aws-lambda';
import type { IBucket } from 'aws-cdk-lib/aws-s3';
import { AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId } from 'aws-cdk-lib/custom-resources';
import { NextjsGlobalFunctions } from 'cdk-nextjs';
import type { Construct } from 'constructs';
import { join } from 'node:path';

export interface WebStackProps extends StackProps {
  apiUrl: string;
  userPoolId: string;
  userPoolClientId: string;
  rawBucket: IBucket;
}

/** FinanceAppWeb: the Next.js app on Lambda behind CloudFront (cdk-nextjs NextjsGlobalFunctions). */
export class WebStack extends Stack {
  constructor(scope: Construct, id: string, props: WebStackProps) {
    super(scope, id, props);

    const nextjs = new NextjsGlobalFunctions(this, 'Nextjs', {
      buildDirectory: join(import.meta.dirname, '..', '..'),
      overrides: {
        nextjsFunctions: {
          functionProps: {
            environment: {
              API_URL: props.apiUrl,
              COGNITO_USER_POOL_ID: props.userPoolId,
              COGNITO_CLIENT_ID: props.userPoolClientId,
              COGNITO_REGION: this.region,
            },
          },
        },
      },
    });

    // The deployment policy cannot create SSM parameters: drop the distribution-id parameter,
    // its invalidation policy, and the environment variable that names it. Without them the app
    // does not create CloudFront invalidations on revalidatePath/revalidateTag (it does not use them).
    nextjs.node.tryRemoveChild('DistributionIdParameter');
    nextjs.node.tryRemoveChild('InvalidationPolicy');
    for (const group of nextjs.nextjsFunctions.functionGroups) {
      (group.function.node.defaultChild as CfnFunction).addPropertyDeletionOverride(
        'Environment.Variables.CDK_NEXTJS_DISTRIBUTION_ID_PARAM_NAME',
      );
    }

    // raw-ingest CORS: browser POSTs (presigned) from the app's CloudFront domain and local dev.
    const domain = nextjs.nextjsDistribution.distribution.distributionDomainName;
    const cors = {
      service: 'S3',
      action: 'putBucketCors',
      parameters: {
        Bucket: props.rawBucket.bucketName,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedMethods: ['POST'],
              AllowedOrigins: [`https://${domain}`, 'http://localhost:3000'],
              AllowedHeaders: ['*'],
              MaxAgeSeconds: 3000,
            },
          ],
        },
      },
      physicalResourceId: PhysicalResourceId.of('RawIngestCors'),
    };
    new AwsCustomResource(this, 'RawIngestCors', {
      onCreate: cors,
      onUpdate: cors,
      installLatestAwsSdk: false,
      policy: AwsCustomResourcePolicy.fromSdkCalls({ resources: [props.rawBucket.bucketArn] }),
    });

    new CfnOutput(this, 'AppUrl', { value: nextjs.url });
  }
}
