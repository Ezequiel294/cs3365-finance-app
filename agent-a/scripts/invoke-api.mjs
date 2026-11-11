#!/usr/bin/env node
/**
 * Smoke-test helper: builds an API Gateway v2 event with Cognito claims for a
 * synthetic user and prints it, so `aws lambda invoke` can call ApiFn directly.
 *
 *   node scripts/invoke-api.mjs <userId> <METHOD> <path?query> [jsonBody] > event.json
 */
const [userId, method, target, body] = process.argv.slice(2);
if (!userId || !method || !target) {
  console.error('usage: invoke-api.mjs <userId> <METHOD> <path?query> [jsonBody]');
  process.exit(1);
}
const [path, query = ''] = target.split('?');
const event = {
  version: '2.0',
  routeKey: '$default',
  rawPath: path,
  rawQueryString: query,
  headers: { host: 'smoke.test', 'content-type': 'application/json' },
  body: body ?? undefined,
  isBase64Encoded: false,
  requestContext: {
    accountId: 'smoke',
    apiId: 'smoke',
    domainName: 'smoke.test',
    domainPrefix: 'smoke',
    requestId: `smoke-${Date.now()}`,
    routeKey: '$default',
    stage: '$default',
    time: new Date().toISOString(),
    timeEpoch: Date.now(),
    http: { method, path, protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'smoke-test' },
    authorizer: { jwt: { claims: { sub: userId }, scopes: [] } },
  },
};
process.stdout.write(JSON.stringify(event));
