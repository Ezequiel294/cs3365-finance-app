import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ApiStack } from "../lib/api-stack";
import { DataStack } from "../lib/data-stack";

// The web stack runs `next build` during synth, so it is checked by `cdk synth` instead of here.
const workspaceRoot = join(import.meta.dirname, "..", "..");
const env = { account: "111111111111", region: "us-east-2" };
const app = new App();
const data = new DataStack(app, "FinanceAppA1Data", { env });
const api = new ApiStack(app, "FinanceAppA1Api", { env, data, workspaceRoot });
const dataTemplate = Template.fromStack(data);
const apiTemplate = Template.fromStack(api);

const PHYSICAL_NAME_PROPS = ["TableName", "FunctionName", "BucketName", "RoleName", "UserPoolName"];

describe("FinanceAppData", () => {
  it("has five on-demand tables with point-in-time recovery, retained on delete", () => {
    const tables = dataTemplate.findResources("AWS::DynamoDB::Table");
    expect(Object.keys(tables)).toHaveLength(5);
    for (const t of Object.values(tables)) {
      expect(t.DeletionPolicy).toBe("Retain");
      expect(t.Properties.BillingMode).toBe("PAY_PER_REQUEST");
      expect(t.Properties.PointInTimeRecoverySpecification).toEqual({ PointInTimeRecoveryEnabled: true });
    }
  });

  it("has the review and ticker indexes", () => {
    dataTemplate.hasResourceProperties("AWS::DynamoDB::Table", {
      GlobalSecondaryIndexes: [Match.objectLike({ IndexName: "review", KeySchema: [{ AttributeName: "reviewPK", KeyType: "HASH" }, { AttributeName: "reviewSK", KeyType: "RANGE" }] })],
    });
    dataTemplate.hasResourceProperties("AWS::DynamoDB::Table", {
      GlobalSecondaryIndexes: [Match.objectLike({ IndexName: "ticker", KeySchema: [{ AttributeName: "tickerPK", KeyType: "HASH" }, { AttributeName: "SK", KeyType: "RANGE" }] })],
    });
  });
});

describe("FinanceAppApi", () => {
  it("puts the Cognito JWT authorizer on /api/* and none on the ingest routes", () => {
    const routes = Object.values(apiTemplate.findResources("AWS::ApiGatewayV2::Route")).map((r) => r.Properties);
    const byKey = Object.fromEntries(routes.map((r) => [r.RouteKey, r]));
    expect(byKey["ANY /api/{proxy+}"].AuthorizationType).toBe("JWT");
    for (const key of ["GET /ingest/gmail/config", "POST /ingest/gmail", "POST /ingest/gmail/heartbeat"]) {
      expect(byKey[key].AuthorizationType ?? "NONE").toBe("NONE");
    }
  });

  it("builds ApiFn and ImportWorkerFn from one code bundle", () => {
    const fns = Object.values(apiTemplate.findResources("AWS::Lambda::Function"))
      .map((f) => f.Properties)
      .filter((p) => p.Handler === "index.apiHandler" || p.Handler === "index.importWorkerHandler");
    expect(fns).toHaveLength(2);
    expect(fns[0].Code.S3Key).toEqual(fns[1].Code.S3Key);
  });

  it("passes only SSM parameter names to the Lambdas and lets them read /FinanceApp/bccr/*", () => {
    apiTemplate.hasResourceProperties("AWS::Lambda::Function", {
      Handler: "index.apiHandler",
      Environment: { Variables: Match.objectLike({ BCCR_PARAM_PREFIX: "/FinanceApp/bccr", PRICE_API_KEY_PARAM: "/FinanceApp/prices/apiKey" }) },
    });
    const policies = JSON.stringify(apiTemplate.findResources("AWS::IAM::Policy"));
    expect(policies).toContain("parameter/FinanceApp/bccr/*");
    expect(policies).toContain("ssm:GetParameters");
  });

  it("keeps the raw-ingest bucket private and encrypted", () => {
    apiTemplate.hasResourceProperties("AWS::S3::Bucket", {
      PublicAccessBlockConfiguration: { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true },
      BucketEncryption: Match.anyValue(),
    });
  });

  it("sets no physical resource names", () => {
    for (const template of [dataTemplate, apiTemplate]) {
      for (const r of Object.values(template.toJSON().Resources) as { Type: string; Properties?: Record<string, unknown> }[]) {
        if (r.Type.startsWith("Custom::")) continue;
        // A physical name would be a literal string; references to generated names are objects.
        for (const prop of PHYSICAL_NAME_PROPS) expect(typeof r.Properties?.[prop], `${r.Type}.${prop}`).not.toBe("string");
      }
    }
  });
});
