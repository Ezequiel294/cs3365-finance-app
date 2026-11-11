import { RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import { AttributeType, Billing, TableV2 } from 'aws-cdk-lib/aws-dynamodb';
import { AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId } from 'aws-cdk-lib/custom-resources';
import type { Construct } from 'constructs';
import { GLOBAL_CATEGORIES, GLOBAL_RULES } from './seed';

/** The five DynamoDB tables: on-demand, point-in-time recovery, retained on stack deletion. */
export class DataStack extends Stack {
  readonly transactions: TableV2;
  readonly investmentTx: TableV2;
  readonly aggregates: TableV2;
  readonly reference: TableV2;
  readonly ingestion: TableV2;

  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    const table = (name: string, extra: Partial<ConstructorParameters<typeof TableV2>[2]> = {}) =>
      new TableV2(this, name, {
        partitionKey: { name: 'PK', type: AttributeType.STRING },
        sortKey: { name: 'SK', type: AttributeType.STRING },
        billing: Billing.onDemand(),
        pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
        removalPolicy: RemovalPolicy.RETAIN,
        deletionProtection: true,
        ...extra,
      });

    this.transactions = table('Transactions', {
      globalSecondaryIndexes: [
        {
          indexName: 'review',
          partitionKey: { name: 'reviewPK', type: AttributeType.STRING },
          sortKey: { name: 'reviewSK', type: AttributeType.STRING },
        },
      ],
    });
    this.investmentTx = table('InvestmentTransactions', {
      globalSecondaryIndexes: [
        {
          indexName: 'ticker',
          partitionKey: { name: 'tickerPK', type: AttributeType.STRING },
          sortKey: { name: 'SK', type: AttributeType.STRING },
        },
      ],
    });
    this.aggregates = table('Aggregates', { timeToLiveAttribute: 'ttl' });
    this.reference = table('Reference');
    this.ingestion = table('Ingestion', { timeToLiveAttribute: 'ttl' });

    // Global categories and merchant rules (PK = GLOBAL), shared by every user.
    const seed = (name: string, items: Record<string, unknown>[]) => {
      const call = {
        service: 'DynamoDB',
        action: 'batchWriteItem',
        parameters: { RequestItems: { [this.reference.tableName]: items.map((Item) => ({ PutRequest: { Item } })) } },
        physicalResourceId: PhysicalResourceId.of(`${name}-v1`),
      };
      new AwsCustomResource(this, name, {
        onCreate: call,
        onUpdate: call,
        policy: AwsCustomResourcePolicy.fromSdkCalls({ resources: [this.reference.tableArn] }),
        installLatestAwsSdk: false,
      });
    };
    seed('SeedGlobalCategories', GLOBAL_CATEGORIES);
    seed('SeedGlobalRules', GLOBAL_RULES);
  }
}
