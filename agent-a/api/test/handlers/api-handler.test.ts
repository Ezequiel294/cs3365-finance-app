import { GetCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2, Context } from 'aws-lambda';
import { describe, expect, it } from 'vitest';
import { ApiHandler } from '../../src/handlers/api-handler';
import { messageIdOf } from '../../src/routers/ingest-router';
import { ServiceFactory } from '../../src/service-factory';
import { mockedStore } from '../ddb-mock';
import { sample } from '../helpers';

process.env.TRANSACTIONS_TABLE = 'Tx';
process.env.INVESTMENT_TX_TABLE = 'Inv';
process.env.AGGREGATES_TABLE = 'Agg';
process.env.REFERENCE_TABLE = 'Ref';
process.env.INGESTION_TABLE = 'Ing';
process.env.RAW_BUCKET = 'raw';
process.env.BCCR_PARAM_PREFIX = '/FinanceApp/bccr';

function event(method: string, path: string, opts: { body?: string; sub?: string; headers?: Record<string, string>; query?: string } = {}): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: path,
    rawQueryString: opts.query ?? '',
    headers: { host: 'api.example', 'content-type': 'application/json', ...(opts.headers ?? {}) },
    body: opts.body,
    isBase64Encoded: false,
    requestContext: {
      accountId: '1', apiId: 'a', domainName: 'api.example', domainPrefix: 'api', requestId: 'r', routeKey: '$default', stage: '$default', time: '', timeEpoch: 0,
      http: { method, path, protocol: 'HTTP/1.1', sourceIp: '1.1.1.1', userAgent: 'x' },
      ...(opts.sub ? { authorizer: { jwt: { claims: { sub: opts.sub }, scopes: [] } } } : {}),
    },
  } as unknown as APIGatewayProxyEventV2;
}

function build() {
  const factory = new ServiceFactory();
  const { store, mock } = mockedStore();
  (factory as unknown as { store: () => unknown }).store = () => store;
  mock.on(GetCommand).resolves({});
  return { handler: new ApiHandler(factory), mock };
}

const ctx = {} as Context;

describe('ApiHandler', () => {
  it('returns 401 for /api routes without Cognito claims', async () => {
    const { handler } = build();
    const res = await handler.handler(event('GET', '/api/accounts'), ctx);
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body!)).toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('returns 401 for /ingest/gmail with an unknown token', async () => {
    const { handler } = build();
    const res = await handler.handler(event('POST', '/ingest/gmail', { body: 'From: x', headers: { authorization: `Bearer ${'a'.repeat(43)}` } }), ctx);
    expect(res.statusCode).toBe(401);
    const missing = await handler.handler(event('GET', '/ingest/gmail/config'), ctx);
    expect(missing.statusCode).toBe(401);
  });

  it('maps validation errors to 400 with {code, message}', async () => {
    const { handler } = build();
    const res = await handler.handler(event('POST', '/api/accounts', { sub: 'user-1', body: JSON.stringify({ name: 'x', bank: 'HSBC', currency: 'USD' }) }), ctx);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body!)).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('returns 404 for unknown routes and for a missing import', async () => {
    const { handler } = build();
    expect((await handler.handler(event('GET', '/api/nope', { sub: 'user-1' }), ctx)).statusCode).toBe(404);
    expect((await handler.handler(event('GET', '/api/imports/abc', { sub: 'user-1' }), ctx)).statusCode).toBe(404);
  });

  it('reads the Message-ID from folded headers', () => {
    expect(messageIdOf(sample('bac-card-alert.eml'))).toBe('<010001a1c6af2508-141986e1-9664-488d-b416-9305db6577a5-000000@email.amazonses.com>');
    expect(messageIdOf(Buffer.from('Subject: x\r\n\r\nbody'))).toMatch(/^sha256:/);
  });
});
