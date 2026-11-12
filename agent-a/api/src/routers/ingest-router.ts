import { Router } from '@aws-lambda-powertools/event-handler/http';
import { ValidationError } from '../http/errors';
import { sha256Hex } from '../ids';
import { headerMessageId } from '../ingest/email-template-parser';
import { ok } from '../http/respond';
import type { ServiceFactory } from '../service-factory';

export const PROCESSED_LABEL = 'financeapp-processed';
const MAX_EMAIL_BYTES = 4 * 1024 * 1024;

function bearer(req: Request): string | null {
  const h = req.headers.get('authorization') ?? '';
  const m = /^Bearer\s+(\S+)$/i.exec(h.trim());
  return m ? m[1]! : null;
}

/**
 * The Gmail script's routes. No Cognito claims here: the hashed ingest token is the only
 * credential, checked by ConnectionService on every call.
 */
export function ingestRouter(f: ServiceFactory): Router {
  const r = new Router();
  r.get('/config', async (ctx) => {
    await f.connectionService().authenticateAndTouch(bearer(ctx.req));
    return ok({ senders: f.connectionService().senders(), label: PROCESSED_LABEL });
  });
  r.post('/heartbeat', async (ctx) => {
    await f.connectionService().heartbeat(bearer(ctx.req));
    return ok({ ok: true });
  });
  r.post('/', async (ctx) => {
    const token = await f.connectionService().authenticateAndTouch(bearer(ctx.req));
    const mime = await ctx.req.text();
    if (!mime || mime.length > MAX_EMAIL_BYTES) throw new ValidationError('The email is empty or too large.');
    const header = headerMessageId(mime);
    const messageId = (header && /^[\x21-\x7e]{1,300}$/.test(header) ? header : `sha256-${sha256Hex(mime)}`).slice(0, 300);
    const rawRef = await f.rawObjectStore().putRawEmail(token.userId, messageId, mime);
    const result = await f.ingestPipeline().processEmail(token.userId, messageId, rawRef);
    return ok(result);
  });
  return r;
}
