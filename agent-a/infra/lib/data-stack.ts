import { RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import { AttributeType, BillingMode, ProjectionType, Table } from 'aws-cdk-lib/aws-dynamodb';
import { AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId } from 'aws-cdk-lib/custom-resources';
import type { Construct } from 'constructs';
import { GLOBAL_CATEGORIES } from '../../shared/catalog';

export interface DataTables {
  transactions: Table;
  investmentTx: Table;
  aggregates: Table;
  reference: Table;
  ingestion: Table;
}

/** FinanceAppData: five on-demand DynamoDB tables with PITR, retained on delete, and the global catalog seed. */
export class DataStack extends Stack {
  readonly tables: DataTables;

  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    const table = (name: string, ttl?: string) =>
      new Table(this, name, {
        partitionKey: { name: 'PK', type: AttributeType.STRING },
        sortKey: { name: 'SK', type: AttributeType.STRING },
        billingMode: BillingMode.PAY_PER_REQUEST,
        pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
        removalPolicy: RemovalPolicy.RETAIN,
        timeToLiveAttribute: ttl,
      });

    const transactions = table('Transactions');
    // Sparse: only transactions that need a decision carry reviewPK.
    transactions.addGlobalSecondaryIndex({
      indexName: 'review',
      partitionKey: { name: 'reviewPK', type: AttributeType.STRING },
      sortKey: { name: 'reviewSK', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    const investmentTx = table('InvestmentTransactions');
    investmentTx.addGlobalSecondaryIndex({
      indexName: 'ticker',
      partitionKey: { name: 'tickerPK', type: AttributeType.STRING },
      sortKey: { name: 'SK', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    const aggregates = table('Aggregates', 'ttl');
    const reference = table('Reference');
    const ingestion = table('Ingestion', 'ttl');

    this.tables = { transactions, investmentTx, aggregates, reference, ingestion };

    // GlobalCatalogSeed: plain puts of fixed items on every deployment, so repeating them changes nothing.
    const items = GLOBAL_CATEGORIES.map((c) => ({
      PutRequest: {
        Item: {
          PK: { S: 'GLOBAL' },
          SK: { S: `CAT#${c.id}` },
          id: { S: c.id },
          name: { S: c.name },
          scope: { S: 'global' },
          archived: { BOOL: false },
        },
      },
    }));
    const call = {
      service: 'DynamoDB',
      action: 'batchWriteItem',
      parameters: { RequestItems: { [reference.tableName]: items } },
      // A new physical id per synth makes CloudFormation run the seed on every deployment.
      physicalResourceId: PhysicalResourceId.of(`GlobalCatalogSeed-${Date.now()}`),
    };
    new AwsCustomResource(this, 'GlobalCatalogSeed', {
      onCreate: call,
      onUpdate: call,
      installLatestAwsSdk: false,
      policy: AwsCustomResourcePolicy.fromSdkCalls({ resources: [reference.tableArn] }),
    });
  }
}
