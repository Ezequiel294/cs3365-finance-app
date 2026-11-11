import { join } from 'node:path';
import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import type { CfnFunction } from 'aws-cdk-lib/aws-lambda';
import { AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId } from 'aws-cdk-lib/custom-resources';
import { NextjsGlobalFunctions } from 'cdk-nextjs';
import type { Construct } from 'constructs';
import type { ApiStack } from './api-stack';

const ROOT = join(import.meta.dirname, '..', '..');

export interface WebStackProps extends StackProps {
  api: ApiStack;
}

/** The Next.js app on Lambda behind CloudFront, deployed with cdk-nextjs `NextjsGlobalFunctions`. */
export class WebStack extends Stack {
  constructor(scope: Construct, id: string, props: WebStackProps) {
    super(scope, id, props);
    const { api } = props;

    const nextjs = new NextjsGlobalFunctions(this, 'Nextjs', {
      buildDirectory: join(ROOT, 'web'),
      buildCommand: 'npx next build',
      overrides: {
        nextjsFunctions: {
          functionProps: {
            environment: {
              API_URL: api.apiUrl,
              COGNITO_CLIENT_ID: api.userPoolClient.userPoolClientId,
              COGNITO_REGION: this.region,
            },
          },
        },
      },
    });

    // cdk-nextjs publishes the distribution ID in an SSM parameter for on-demand
    // revalidation. This account's deployment policy cannot create SSM parameters,
    // and the app never calls revalidatePath/revalidateTag, so the parameter, the
    // policy that reads it, and the environment variable that names it are removed.
    nextjs.node.tryRemoveChild('DistributionIdParameter');
    nextjs.node.tryRemoveChild('InvalidationPolicy');
    for (const group of nextjs.nextjsFunctions.functionGroups) {
      (group.function.node.defaultChild as CfnFunction).addPropertyDeletionOverride(
        'Environment.Variables.CDK_NEXTJS_DISTRIBUTION_ID_PARAM_NAME',
      );
    }

    const domain = nextjs.nextjsDistribution.distribution.domainName;

    // The raw-ingest bucket accepts browser POSTs (presigned statement uploads) from the
    // app's CloudFront domain and from local development. Set here because the domain
    // only exists once this stack creates the distribution.
    const cors = {
      service: 'S3',
      action: 'putBucketCors',
      parameters: {
        Bucket: api.rawBucket.bucketName,
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
      physicalResourceId: PhysicalResourceId.of(`raw-ingest-cors`),
    };
    new AwsCustomResource(this, 'RawIngestCors', {
      onCreate: cors,
      onUpdate: cors,
      policy: AwsCustomResourcePolicy.fromSdkCalls({ resources: [api.rawBucket.bucketArn] }),
      installLatestAwsSdk: false,
    });

    new CfnOutput(this, 'AppUrl', { value: nextjs.url });
  }
}
