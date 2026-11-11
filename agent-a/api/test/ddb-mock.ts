import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoStore } from '../src/repositories/dynamo-store';

/** A DynamoStore whose DocumentClient is mocked at the client boundary. */
export function mockedStore() {
  const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-2' }), {
    marshallOptions: { removeUndefinedValues: true },
  });
  const mock = mockClient(doc);
  return { store: new DynamoStore(doc), mock };
}

/** A `TransactionCanceledException` like the SDK throws. */
export function cancelled(codes: string[]): Error {
  const err = new Error('Transaction cancelled') as Error & { CancellationReasons: { Code: string }[] };
  err.name = 'TransactionCanceledException';
  err.CancellationReasons = codes.map((Code) => ({ Code }));
  return err;
}
