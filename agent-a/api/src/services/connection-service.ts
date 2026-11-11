import { createHash, randomBytes } from 'node:crypto';
import type { Connection, ConnectionView, GmailSetup } from '@finance/shared';
import type { Clock } from '../clock';
import { NotFoundError, UnauthorizedError, ValidationError } from '../errors';
import type { TemplateRegistry } from '../ingest/template-registry';
import type { IngestionRepository, IngestToken, StoredConnection } from '../repositories/ingestion-repository';

/** A connection with no heartbeat for this long is stale (01-S09). */
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export function isStale(connection: Pick<Connection, 'status' | 'lastSeenAt'>, now: Date): boolean {
  if (connection.status !== 'ACTIVE') return false;
  if (!connection.lastSeenAt) return true;
  return now.getTime() - new Date(connection.lastSeenAt).getTime() > STALE_AFTER_MS;
}

export interface IngestConfig {
  senders: string[];
  label: string;
}

export const PROCESSED_LABEL = 'financeapp-processed';

/**
 * The Gmail connection: a random ingest token whose SHA-256 is the only thing
 * stored. The token is returned once, from `createGmail` or `rotate`, and never
 * stored or logged.
 */
export class ConnectionService {
  constructor(
    private readonly ingestion: IngestionRepository,
    private readonly registry: TemplateRegistry,
    private readonly clock: Clock,
    private readonly renderScript: (apiBase: string) => string,
  ) {}

  async createGmail(userId: string, apiBase: string): Promise<GmailSetup> {
    const token = this.newToken();
    const tokenHash = this.hash(token);
    const connection: StoredConnection = {
      id: crypto.randomUUID(),
      type: 'gmail',
      status: 'PENDING',
      tokenPrefix: token.slice(0, 6),
      tokenHash,
      lastSeenAt: null,
      createdAt: this.clock.now().toISOString(),
    };
    await this.ingestion.writeConnection(userId, connection, { tokenHash, userId, connectionId: connection.id });
    return { connectionId: connection.id, token, script: this.renderScript(apiBase) };
  }

  /** Hashes the bearer token and looks up `TOKEN#<sha256>`. A revoked token has no item. */
  async authenticate(token: string | null | undefined): Promise<IngestToken> {
    if (!token || token.length < 20 || token.length > 200) throw new UnauthorizedError('Invalid ingest token');
    const found = await this.ingestion.getToken(this.hash(token));
    if (!found) throw new UnauthorizedError('Invalid ingest token');
    return found;
  }

  /** `GET /ingest/gmail/config`: marks the connection active and returns the sender allowlist. */
  async config(token: string | null | undefined): Promise<IngestConfig> {
    const auth = await this.authenticate(token);
    await this.ingestion.touchConnection(auth.userId, auth.connectionId, this.clock.now().toISOString());
    return { senders: this.registry.senderAllowlist(), label: PROCESSED_LABEL };
  }

  async heartbeat(token: string | null | undefined): Promise<void> {
    const auth = await this.authenticate(token);
    await this.ingestion.touchConnection(auth.userId, auth.connectionId, this.clock.now().toISOString());
  }

  async touch(auth: IngestToken): Promise<void> {
    await this.ingestion.touchConnection(auth.userId, auth.connectionId, this.clock.now().toISOString());
  }

  async list(userId: string): Promise<ConnectionView[]> {
    const now = this.clock.now();
    const since = new Date(now.getTime() - 7 * 86_400_000).toISOString();
    const [connections, stats] = await Promise.all([this.ingestion.listConnections(userId), this.ingestion.messageStats(userId, since)]);
    return connections
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((c) => {
        const { tokenHash: _hash, ...connection } = c;
        return { connection, stale: isStale(c, now), lastSevenDays: stats };
      });
  }

  /** Replaces the token: deletes the old `TOKEN#`, writes a new one, and sets the connection PENDING. */
  async rotate(userId: string, connectionId: string, apiBase: string): Promise<GmailSetup> {
    const current = await this.ingestion.getConnection(userId, connectionId);
    if (!current) throw new NotFoundError('Connection not found');
    if (current.status === 'REVOKED') throw new ValidationError('This connection was revoked; connect Gmail again');
    const token = this.newToken();
    const tokenHash = this.hash(token);
    const next: StoredConnection = { ...current, status: 'PENDING', tokenPrefix: token.slice(0, 6), tokenHash };
    await this.ingestion.writeConnection(userId, next, { tokenHash, userId, connectionId }, current.tokenHash);
    return { connectionId, token, script: this.renderScript(apiBase) };
  }

  /** Deletes the token's hash, so the script's next call is rejected immediately (06-S02). */
  async revoke(userId: string, connectionId: string): Promise<void> {
    const current = await this.ingestion.getConnection(userId, connectionId);
    if (!current) throw new NotFoundError('Connection not found');
    const next: StoredConnection = { ...current, status: 'REVOKED', tokenHash: null };
    await this.ingestion.writeConnection(userId, next, undefined, current.tokenHash);
  }

  private newToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
