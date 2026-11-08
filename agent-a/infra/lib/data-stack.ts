import { RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import { AttributeType, BillingMode, ProjectionType, Table } from "aws-cdk-lib/aws-dynamodb";
import { AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId } from "aws-cdk-lib/custom-resources";
import type { Construct } from "constructs";
import { createHash } from "node:crypto";
import { GLOBAL_CATEGORIES, GLOBAL_RULES, GLOBAL_TAGS } from "../../api/src/reference/global-seed";

/**
 * FinanceAppData: the five DynamoDB tables (on-demand, point-in-time recovery, RETAIN) and the
 * global categories, tags, and merchant rules.
 */
export class DataStack extends Stack {
  readonly transactions: Table;
  readonly investmentTx: Table;
  readonly aggregates: Table;
  readonly reference: Table;
  readonly ingestion: Table;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const table = (name: string, ttl?: string) =>
      new Table(this, name, {
        partitionKey: { name: "PK", type: AttributeType.STRING },
        sortKey: { name: "SK", type: AttributeType.STRING },
        billingMode: BillingMode.PAY_PER_REQUEST,
        pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
        removalPolicy: RemovalPolicy.RETAIN,
        timeToLiveAttribute: ttl,
      });

    this.transactions = table("Transactions");
    this.transactions.addGlobalSecondaryIndex({
      indexName: "review",
      partitionKey: { name: "reviewPK", type: AttributeType.STRING },
      sortKey: { name: "reviewSK", type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    this.investmentTx = table("InvestmentTransactions");
    this.investmentTx.addGlobalSecondaryIndex({
      indexName: "ticker",
      partitionKey: { name: "tickerPK", type: AttributeType.STRING },
      sortKey: { name: "SK", type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    this.aggregates = table("Aggregates", "ttl");
    this.reference = table("Reference");
    this.ingestion = table("Ingestion", "ttl");

    this.seedGlobalReference();
  }

  /** Writes the GLOBAL categories, tags, and rules with BatchWriteItem (25 items per call). */
  private seedGlobalReference(): void {
    const s = (v: string) => ({ S: v });
    const items = [
      ...GLOBAL_CATEGORIES.map((c) => ({ PK: s("GLOBAL"), SK: s(`CAT#${c.id}`), id: s(c.id), name: s(c.name), archived: { BOOL: false } })),
      ...GLOBAL_TAGS.map((t) => ({ PK: s("GLOBAL"), SK: s(`TAG#${t.id}`), id: s(t.id), name: s(t.name), archived: { BOOL: false } })),
      ...GLOBAL_RULES.map((r) => ({
        PK: s("GLOBAL"),
        SK: s(`RULE#${r.merchantKey}`),
        merchantKey: s(r.merchantKey),
        categoryId: s(r.categoryId),
        tagIds: { L: r.tagIds.map(s) },
      })),
    ];
    for (let i = 0; i < items.length; i += 25) {
      const chunk = items.slice(i, i + 25);
      const version = createHash("sha256").update(JSON.stringify(chunk)).digest("hex").slice(0, 16);
      const call = {
        service: "DynamoDB",
        action: "batchWriteItem",
        parameters: { RequestItems: { [this.reference.tableName]: chunk.map((Item) => ({ PutRequest: { Item } })) } },
        physicalResourceId: PhysicalResourceId.of(`global-seed-${i / 25}-${version}`),
      };
      new AwsCustomResource(this, `GlobalSeed${i / 25}`, {
        onCreate: call,
        onUpdate: call,
        installLatestAwsSdk: false,
        policy: AwsCustomResourcePolicy.fromSdkCalls({ resources: [this.reference.tableArn] }),
      });
    }
  }
}
