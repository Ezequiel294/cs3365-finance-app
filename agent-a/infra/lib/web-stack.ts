import { CfnOutput, Stack, type StackProps } from "aws-cdk-lib";
import type { CfnFunction } from "aws-cdk-lib/aws-lambda";
import { NextjsGlobalFunctions } from "cdk-nextjs";
import type { Construct } from "constructs";
import { join } from "node:path";
import type { ApiStack } from "./api-stack";

export interface WebStackProps extends StackProps {
  api: ApiStack;
  workspaceRoot: string;
}

/**
 * FinanceAppWeb: the Next.js app on Lambda (Function URL behind CloudFront with OAC), static assets
 * in S3, and the Next.js cache in S3 and DynamoDB, all from cdk-nextjs's NextjsGlobalFunctions.
 */
export class WebStack extends Stack {
  constructor(scope: Construct, id: string, props: WebStackProps) {
    super(scope, id, props);
    const nextjs = new NextjsGlobalFunctions(this, "Nextjs", {
      buildDirectory: join(props.workspaceRoot, "web"),
      overrides: {
        nextjsFunctions: {
          functionProps: {
            environment: {
              API_URL: props.api.apiUrl,
              COGNITO_CLIENT_ID: props.api.userPoolClient.userPoolClientId,
              COGNITO_USER_POOL_ID: props.api.userPool.userPoolId,
              COGNITO_REGION: this.region,
            },
          },
        },
      },
    });
    this.removeCloudFrontInvalidationWiring(nextjs);
    new CfnOutput(this, "AppUrl", { value: nextjs.url });
  }

  /**
   * cdk-nextjs publishes the distribution ID to an SSM parameter (with a fixed physical name) so
   * revalidatePath/revalidateTag can invalidate CloudFront. This account's CloudFormation policy only
   * allows reading SSM parameters, and the app never revalidates (pages are dynamic and actions use
   * `refresh()`), so the parameter, its IAM policy, and the env var pointing at it are removed.
   */
  private removeCloudFrontInvalidationWiring(nextjs: NextjsGlobalFunctions): void {
    nextjs.node.tryRemoveChild("DistributionIdParameter");
    nextjs.node.tryRemoveChild("InvalidationPolicy");
    for (const group of nextjs.nextjsFunctions.functionGroups) {
      (group.function.node.defaultChild as CfnFunction).addPropertyDeletionOverride("Environment.Variables.CDK_NEXTJS_DISTRIBUTION_ID_PARAM_NAME");
    }
  }
}
