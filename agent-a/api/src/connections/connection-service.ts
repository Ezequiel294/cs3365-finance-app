import { createHash, randomBytes } from "node:crypto";
import type { Connection, GmailSetup, IngestConfig, IngestToken } from "@finance/shared";
import type { Clock } from "../clock";
import { NotFoundError, UnauthorizedError } from "../http/errors";
import { randomId } from "../ids";
import type { TemplateRegistry } from "../ingest/template-registry";
import type { ConnectionRecord, IngestionRepository } from "../repositories/ingestion-repository";
import { GMAIL_SCRIPT_TEMPLATE } from "./gmail-script.generated";

export const STALE_AFTER_MS = 24 * 3600 * 1000;
export const PROCESSED_LABEL = "financeapp-processed";
const TOKEN_PREFIX_LENGTH = 6;

/** `isStale(now)` from the class diagram: an active connection that has not called in for 24 hours. */
export function isStale(connection: Pick<Connection, "status" | "lastSeenAt">, now: Date): boolean {
  if (connection.status !== "ACTIVE" || !connection.lastSeenAt) return false;
  return now.getTime() - Date.parse(connection.lastSeenAt) > STALE_AFTER_MS;
}

/**
 * The Gmail connection: a random ingest token whose SHA-256 is the only thing stored. The token is
 * returned once (create or rotate) and never stored or logged. Revoking deletes the hash, so the
 * next call from the script is rejected.
 */
export class ConnectionService {
  constructor(
    private readonly ingestion: IngestionRepository,
    private readonly registry: TemplateRegistry,
    private readonly clock: Clock,
    private readonly ingestBaseUrl: string,
  ) {}

  async createGmail(userId: string): Promise<GmailSetup> {
    const token = this.newToken();
    const tokenHash = this.hash(token);
    const connection: ConnectionRecord = {
      id: randomId(12),
      userId,
      type: "gmail",
      status: "PENDING",
      tokenPrefix: token.slice(0, TOKEN_PREFIX_LENGTH),
      tokenHash,
      createdAt: this.clock.now().toISOString(),
    };
    await this.ingestion.writeConnection(connection, { tokenHash, userId, connectionId: connection.id });
    return { connectionId: connection.id, token, script: this.script() };
  }

  /** Looks up `TOKEN#sha256(token)`. Unknown or revoked tokens are rejected with 401. */
  async authenticate(token: string | undefined): Promise<IngestToken> {
    if (!token || token.length < 20 || token.length > 200) throw new UnauthorizedError("invalid ingest token");
    const found = await this.ingestion.getToken(this.hash(token));
    if (!found) throw new UnauthorizedError("invalid ingest token");
    return found;
  }

  /** `GET /ingest/gmail/config`: activates the connection and returns the sender allowlist. */
  async config(token: string | undefined): Promise<IngestConfig> {
    const auth = await this.authenticate(token);
    await this.ingestion.touchConnection(auth.userId, auth.connectionId, this.clock.now(), true);
    return { senders: this.registry.senderAllowlist(), label: PROCESSED_LABEL };
  }

  async list(userId: string): Promise<Connection[]> {
    const now = this.clock.now();
    const records = await this.ingestion.listConnections(userId);
    return records
      .map(({ tokenHash: _hash, userId: _user, ...c }) => ({ ...c, stale: isStale(c, now) }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async rotate(userId: string, connectionId: string): Promise<GmailSetup> {
    const existing = await this.ingestion.getConnection(userId, connectionId);
    if (!existing) throw new NotFoundError("connection not found");
    const token = this.newToken();
    const tokenHash = this.hash(token);
    const updated: ConnectionRecord = { ...existing, status: "PENDING", tokenHash, tokenPrefix: token.slice(0, TOKEN_PREFIX_LENGTH) };
    await this.ingestion.writeConnection(updated, { tokenHash, userId, connectionId }, existing.tokenHash);
    return { connectionId, token, script: this.script() };
  }

  async revoke(userId: string, connectionId: string): Promise<void> {
    const existing = await this.ingestion.getConnection(userId, connectionId);
    if (!existing) throw new NotFoundError("connection not found");
    const revoked: ConnectionRecord = { ...existing, status: "REVOKED", tokenHash: undefined };
    await this.ingestion.writeConnection(revoked, undefined, existing.tokenHash);
  }

  /** Records a script run, so a week without purchases does not look like a broken connection. */
  async heartbeat(token: string | undefined): Promise<void> {
    const auth = await this.authenticate(token);
    await this.ingestion.touchConnection(auth.userId, auth.connectionId, this.clock.now(), true);
  }

  /** Records that an authenticated email arrived. */
  async touch(auth: IngestToken): Promise<void> {
    await this.ingestion.touchConnection(auth.userId, auth.connectionId, this.clock.now(), false);
  }

  private script(): string {
    return GMAIL_SCRIPT_TEMPLATE.replace("__API_BASE__", this.ingestBaseUrl);
  }

  private newToken(): string {
    return randomBytes(32).toString("base64url");
  }

  private hash(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
}
