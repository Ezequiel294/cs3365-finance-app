import { createHash } from 'node:crypto';
import { Router } from '@aws-lambda-powertools/event-handler/http';
import { ValidationError } from '../errors';
import type { ServiceFactory } from '../service-factory';
import { json } from './http';

export const MAX_EMAIL_BYTES = 2 * 1024 * 1024;

function bearer(req: Request): string | null {
  const header = req.headers.get('authorization') ?? '';
  const m = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return m ? m[1] : null;
}

/** The raw request body; API Gateway base64-encodes non-text content types. */
function rawBody(event: unknown): Buffer {
  const e = event as { body?: string | null; isBase64Encoded?: boolean };
  if (!e?.body) return Buffer.alloc(0);
  return e.isBase64Encoded ? Buffer.from(e.body, 'base64') : Buffer.from(e.body, 'utf8');
}

/** The email's Message-ID (folded headers unfolded), or a hash of the content when it has none. */
export function messageIdOf(mime: Buffer): string {
  const text = mime.subarray(0, 64 * 1024).toString('latin1');
  const headerEnd = text.search(/\r?\n\r?\n/);
  const headers = (headerEnd >= 0 ? text.slice(0, headerEnd) : text).replace(/\r?\n[ \t]+/g, ' ');
  const m = /^message-id:\s*(<[^>\s]+>|\S+)/im.exec(headers);
  if (m) return m[1].trim().slice(0, 250);
  return `sha256:${createHash('sha256').update(mime).digest('hex')}`;
}

/**
 * The only routes outside Cognito. Each call authenticates the hashed ingest
 * token through `ConnectionService`; an unknown or revoked token gets 401.
 */
export function ingestRouter(f: ServiceFactory): Router {
  const app = new Router();

  app.get('/ingest/gmail/config', async (ctx) => json(200, await f.connectionService().config(bearer(ctx.req))));

  app.post('/ingest/gmail/heartbeat', async (ctx) => {
    await f.connectionService().heartbeat(bearer(ctx.req));
    return json(200, { ok: true });
  });

  app.post('/ingest/gmail', async (ctx) => {
    const auth = await f.connectionService().authenticate(bearer(ctx.req));
    await f.connectionService().touch(auth);
    const mime = rawBody(ctx.event);
    if (mime.length === 0) throw new ValidationError('Empty email');
    if (mime.length > MAX_EMAIL_BYTES) throw new ValidationError('The email is larger than 2 MiB');
    const messageId = messageIdOf(mime);
    const rawRef = await f.rawObjectStore().putRawEmail(auth.userId, messageId, mime);
    const result = await f.ingestPipeline().processEmail(auth.userId, messageId, rawRef, mime);
    return json(200, result);
  });

  return app;
}
