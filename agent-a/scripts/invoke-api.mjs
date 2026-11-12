// Smoke-test helper: builds an API Gateway HTTP API (v2) event with a Cognito `sub` claim and
// prints it as JSON, for `aws lambda invoke` against ApiFn. Usage:
//   node scripts/invoke-api.mjs GET /api/catalog [jsonBody] [sub]
const [method = 'GET', pathWithQuery = '/api/catalog', body, sub = 'smoke-test-0000-0001'] = process.argv.slice(2);
const [path, query = ''] = pathWithQuery.split('?');
const event = {
  version: '2.0',
  routeKey: '$default',
  rawPath: path,
  rawQueryString: query,
  headers: { 'content-type': 'application/json', host: 'smoke.local' },
  requestContext: {
    accountId: 'smoke',
    apiId: 'smoke',
    domainName: 'smoke.local',
    domainPrefix: 'smoke',
    http: { method, path, protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'smoke' },
    requestId: `smoke-${Date.now()}`,
    routeKey: '$default',
    stage: '$default',
    time: new Date().toISOString(),
    timeEpoch: Date.now(),
    authorizer: { jwt: { claims: { sub }, scopes: [] } },
  },
  body: body || undefined,
  isBase64Encoded: false,
};
process.stdout.write(JSON.stringify(event));
