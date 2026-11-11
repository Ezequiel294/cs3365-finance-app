#!/usr/bin/env node
/**
 * Deletes every item a user owns (PK = USER#<userId>) in the five tables and the
 * user's objects in the raw-ingest bucket. Used to clean up smoke tests.
 *
 *   node scripts/delete-user-data.mjs <stackPrefix> <userId>
 *
 * Table and bucket names are read from the CloudFormation stacks. Shared items
 * (FX#, PRICE#, GLOBAL) are never touched.
 */
import { CloudFormationClient, DescribeStackResourcesCommand } from '@aws-sdk/client-cloudformation';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { BatchWriteCommand, DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';

const [prefix, userId] = process.argv.slice(2);
if (!prefix || !userId) {
  console.error('usage: delete-user-data.mjs <stackPrefix> <userId>');
  process.exit(1);
}
const region = 'us-east-2';
const cfn = new CloudFormationClient({ region });
const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
const s3 = new S3Client({ region });

const physical = async (stack, type) =>
  ((await cfn.send(new DescribeStackResourcesCommand({ StackName: stack }))).StackResources ?? [])
    .filter((r) => r.ResourceType === type)
    .map((r) => r.PhysicalResourceId);

const tables = await physical(`${prefix}Data`, 'AWS::DynamoDB::GlobalTable');
const [bucket] = await physical(`${prefix}Api`, 'AWS::S3::Bucket');

for (const table of tables) {
  let deleted = 0;
  let start;
  do {
    const page = await doc.send(
      new QueryCommand({ TableName: table, KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': `USER#${userId}` }, ProjectionExpression: 'PK, SK', ExclusiveStartKey: start }),
    );
    const keys = page.Items ?? [];
    for (let i = 0; i < keys.length; i += 25) {
      await doc.send(new BatchWriteCommand({ RequestItems: { [table]: keys.slice(i, i + 25).map((Key) => ({ DeleteRequest: { Key } })) } }));
    }
    deleted += keys.length;
    start = page.LastEvaluatedKey;
  } while (start);
  console.log(`${table}: deleted ${deleted} items`);
}

for (const p of [`imports/${userId}/`, `raw/${userId}/`]) {
  const list = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: p }));
  const objects = (list.Contents ?? []).map((o) => ({ Key: o.Key }));
  if (objects.length) await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects } }));
  console.log(`${bucket}/${p}: deleted ${objects.length} objects`);
}
