import { Router } from "@aws-lambda-powertools/event-handler/http";
import { json } from "../http/error-handler";
import { ValidationError } from "../http/errors";
import { bearer } from "../http/request";
import { parseMime } from "../ingest/mime";
import { createHash } from "node:crypto";
import type { ServiceFactory } from "../service-factory";

const MAX_EMAIL_BYTES = 2 * 1024 * 1024;

/**
 * The only routes outside Cognito: `GET /ingest/gmail/config`, `POST /ingest/gmail`,
 * `POST /ingest/gmail/heartbeat`. Each authenticates the hashed ingest token through ConnectionService.
 */
export class IngestRouter {
  readonly router = new Router();

  constructor(services: ServiceFactory) {
    this.router.get("/gmail/config", async (reqCtx) => {
      return json(200, await services.connectionService().config(bearer(reqCtx)));
    });

    this.router.post("/gmail", async (reqCtx) => {
      const connections = services.connectionService();
      const auth = await connections.authenticate(bearer(reqCtx));
      await connections.touch(auth);
      const mime = await reqCtx.req.text();
      if (!mime || mime.length > MAX_EMAIL_BYTES) throw new ValidationError("the body must be one raw email of at most 2 MB");
      const parsed = parseMime(mime);
      const messageId = parsed.messageId ?? createHash("sha256").update(mime).digest("hex");
      const rawRef = await services.rawObjectStore().putRawEmail(auth.userId, messageId, mime);
      const result = await services.ingestPipeline().processEmail(auth.userId, rawRef);
      return json(200, result);
    });

    this.router.post("/gmail/heartbeat", async (reqCtx) => {
      await services.connectionService().heartbeat(bearer(reqCtx));
      return json(200, { ok: true });
    });
  }
}
