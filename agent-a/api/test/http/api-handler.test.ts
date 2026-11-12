import { BatchGetCommand, DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2, Context } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FixedClock } from '../../src/clock';
import { Config } from '../../src/config';
import { ApiHandler } from '../../src/handlers/api-handler';
import { ServiceFactory } from '../../src/service-factory';
import { USER } from '../helpers';

const ddb = mockClient(DynamoDBDocumentClient);

function event(method: string, path: string, opts: { body?: unknown; sub?: string | null; query?: string; headers?: Record<string, string> } = {}): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: path,
    rawQueryString: opts.query ?? '',
    headers: { 'content-type': 'application/json', host: 'api.example', ...(opts.headers ?? {}) },
    requestContext: {
      accountId: '1',
      apiId: 'a',
      domainName: 'api.example',
      domainPrefix: 'api',
      http: { method, path, protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'test' },
      requestId: 'r',
      routeKey: '$default',
      stage: '$default',
      time: '',
      timeEpoch: 0,
      ...(opts.sub === null ? {} : { authorizer: { jwt: { claims: { sub: opts.sub ?? USER }, scopes: [] } } }),
    } as never,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    isBase64Encoded: false,
  };
}

let api: ApiHandler;
const ctx = {} as Context;

beforeAll(() => {
  Object.assign(process.env, {
    TRANSACTIONS_TABLE: 'Transactions',
    INVESTMENT_TX_TABLE: 'InvestmentTx',
    AGGREGATES_TABLE: 'Aggregates',
    REFERENCE_TABLE: 'Reference',
    INGESTION_TABLE: 'Ingestion',
    RAW_BUCKET: 'financeapp-raw',
    BCCR_PARAM_PREFIX: '/FinanceApp/bccr/',
    AWS_REGION: 'us-east-2',
  });
  api = new ApiHandler(new ServiceFactory(new Config(), new FixedClock(new Date('2026-11-11T12:00:00Z'))));
});

beforeEach(() => {
  ddb.reset();
  ddb.on(QueryCommand).resolves({ Items: [] });
  ddb.on(GetCommand).resolves({});
  ddb.on(BatchGetCommand).resolves({ Responses: {} });
});

describe('ApiHandler', () => {
  it('GET /api/catalog returns the catalog as JSON', async () => {
    ddb.on(QueryCommand, { ExpressionAttributeValues: { ':pk': 'GLOBAL', ':p': 'CAT#' } }).resolves({
      Items: [{ PK: 'GLOBAL', SK: 'CAT#groceries', id: 'groceries', name: 'Groceries', scope: 'global', archived: false }],
    });
    const res = await api.handler(event('GET', '/api/catalog'), ctx);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body!)).toEqual({
      categories: [{ id: 'groceries', name: 'Groceries', scope: 'global', archived: false }],
      tags: [],
    });
  });

  it('a request without Cognito claims is 401', async () => {
    const res = await api.handler(event('GET', '/api/accounts', { sub: null }), ctx);
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body!).code).toBe('UNAUTHORIZED');
  });

  it('an invalid body is 400 with field messages', async () => {
    const res = await api.handler(event('POST', '/api/accounts', { body: { name: '', bank: 'XYZ', currency: 'CRC', iban: 'CR12' } }), ctx);
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body!);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(body.fields)).toEqual(expect.arrayContaining(['name', 'bank', 'iban']));
  });

  it('an unknown transaction is 404', async () => {
    const res = await api.handler(event('PATCH', '/api/transactions/20261014-abcdefabcdef', { body: { categoryId: null } }), ctx);
    expect(res.statusCode).toBe(404);
  });

  it('a gmail ingest call without a known token is 401', async () => {
    const res = await api.handler(event('POST', '/ingest/gmail', { sub: null, headers: { authorization: 'Bearer ' + 'x'.repeat(43), 'content-type': 'text/plain' }, body: 'raw' }), ctx);
    expect(res.statusCode).toBe(401);
  });

  it('an unknown route is 404', async () => {
    const res = await api.handler(event('GET', '/api/nothing'), ctx);
    expect(res.statusCode).toBe(404);
  });

  it('GET /api/analytics/spending fills months without data with zeros', async () => {
    const res = await api.handler(event('GET', '/api/analytics/spending', { query: 'period=month&from=2026-09&to=2026-11' }), ctx);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body!)).toEqual([
      { month: '2026-09', incomeCents: 0, expenseCents: 0 },
      { month: '2026-10', incomeCents: 0, expenseCents: 0 },
      { month: '2026-11', incomeCents: 0, expenseCents: 0 },
    ]);
  });
});
