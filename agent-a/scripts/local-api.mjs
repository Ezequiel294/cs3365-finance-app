/**
 * DEVELOPMENT ONLY: serves ApiFn on http://127.0.0.1:4000 for running the web app locally
 * against the deployed tables without API Gateway.
 *
 * API Gateway's Cognito JWT authorizer is NOT present here. This harness reads the `sub` claim
 * from the bearer token WITHOUT verifying it, so it refuses to start unless
 * LOCAL_API_UNVERIFIED_TOKENS=1 is set, and it only listens on the loopback interface.
 * Never deploy or expose it. The deployed app always goes through API Gateway.
 *
 *   LOCAL_API_UNVERIFIED_TOKENS=1 TRANSACTIONS_TABLE=... (see README) node scripts/local-api.mjs
 */
import { createServer } from 'node:http';
// Uses the same bundle as the Lambdas: run `npm run build:api` first.
import { apiHandler } from '../api/dist/index.mjs';

if (process.env.LOCAL_API_UNVERIFIED_TOKENS !== '1') {
  console.error('Refusing to start: set LOCAL_API_UNVERIFIED_TOKENS=1 to accept unverified tokens on 127.0.0.1.');
  process.exit(1);
}

const HOST = '127.0.0.1';
const PORT = Number(process.env.LOCAL_API_PORT ?? 4000);

function subFrom(auth) {
  const token = /^Bearer\s+(\S+)$/i.exec(auth ?? '')?.[1];
  if (!token) return null;
  try {
    return JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')).sub ?? null;
  } catch {
    return null;
  }
}

createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const url = new URL(req.url ?? '/', `http://${HOST}`);
  const sub = url.pathname.startsWith('/api/') ? subFrom(req.headers.authorization) : null;
  if (url.pathname.startsWith('/api/') && !sub) {
    res.writeHead(401, { 'content-type': 'application/json' }).end('{"message":"Unauthorized"}');
    return;
  }
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers[k] = v;
  const event = {
    version: '2.0',
    routeKey: '$default',
    rawPath: url.pathname,
    rawQueryString: url.search.slice(1),
    headers,
    requestContext: {
      http: { method: req.method ?? 'GET', path: url.pathname, protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: headers['user-agent'] ?? '' },
      requestId: `local-${Date.now()}`,
      ...(sub ? { authorizer: { jwt: { claims: { sub }, scopes: [] } } } : {}),
    },
    body: chunks.length ? Buffer.concat(chunks).toString('utf8') : undefined,
    isBase64Encoded: false,
  };
  const out = await apiHandler(event, {});
  res.writeHead(out.statusCode ?? 200, out.headers ?? {}).end(out.body ?? '');
}).listen(PORT, HOST, () => console.log(`local ApiFn on http://${HOST}:${PORT} (unverified tokens, development only)`));
