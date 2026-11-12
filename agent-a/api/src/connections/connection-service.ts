import { randomBytes } from 'node:crypto';
import type { ConnectionView, GmailSetup } from '../../../shared/api-types';
import type { Connection, IngestToken } from '../../../shared/types';
import type { Clock } from '../clock';
import { ConflictError, NotFoundError, UnauthorizedError } from '../http/errors';
import { randomId, sha256Hex } from '../ids';
import type { TemplateRegistry } from '../ingest/template-registry';
import type { IngestionRepository } from '../repositories/ingestion-repository';

export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

type StoredConnection = Connection & { tokenHash?: string };

/** Connection.isStale(now): an active connection that has not been heard from in 24 h. */
export function isStale(connection: Pick<Connection, 'status' | 'lastSeenAt' | 'createdAt'>, now: Date): boolean {
  if (connection.status !== 'ACTIVE') return false;
  const last = connection.lastSeenAt ?? connection.createdAt;
  return now.getTime() - new Date(last).getTime() > STALE_AFTER_MS;
}

/**
 * The Gmail connection (01-S08, 01-S09, 06-S02). The ingest token is random, shown once,
 * and only its SHA-256 is stored; revoking deletes the hash, so the next call is a 401.
 */
export class ConnectionService {
  constructor(
    private readonly ingestion: Pick<
      IngestionRepository,
      'getToken' | 'listConnections' | 'getConnection' | 'writeConnection' | 'touchConnection' | 'messageStats'
    >,
    private readonly registry: Pick<TemplateRegistry, 'senderAllowlist'>,
    private readonly clock: Clock,
    private readonly scriptTemplate: string,
    private readonly apiBaseUrl: string,
  ) {}

  async createGmail(userId: string): Promise<GmailSetup> {
    const existing = await this.ingestion.listConnections(userId);
    if (existing.some((c) => c.status !== 'REVOKED')) {
      throw new ConflictError('Gmail is already connected. Replace the key instead.', 'ALREADY_CONNECTED');
    }
    const token = this.newToken();
    const connection: StoredConnection = {
      id: randomId(10),
      type: 'gmail',
      status: 'PENDING',
      tokenPrefix: token.slice(0, 6),
      tokenHash: this.hash(token),
      lastSeenAt: null,
      createdAt: this.clock.now().toISOString(),
      revokedAt: null,
    };
    await this.ingestion.writeConnection(userId, connection, connection.tokenHash!, null);
    return { connectionId: connection.id, token, script: this.script() };
  }

  async authenticate(token: string | null | undefined): Promise<IngestToken> {
    if (!token || token.length < 20 || token.length > 200) throw new UnauthorizedError();
    const found = await this.ingestion.getToken(this.hash(token));
    if (!found) throw new UnauthorizedError();
    return found;
  }

  /** Authenticate and record the sign of life (setup's config call, every email, the heartbeat). */
  async authenticateAndTouch(token: string | null | undefined): Promise<IngestToken> {
    const found = await this.authenticate(token);
    await this.ingestion.touchConnection(found.userId, found.connectionId, this.clock.now().toISOString());
    return found;
  }

  async heartbeat(token: string | null | undefined): Promise<void> {
    await this.authenticateAndTouch(token);
  }

  async list(userId: string): Promise<ConnectionView[]> {
    const now = this.clock.now();
    const connections = await this.ingestion.listConnections(userId);
    const since = new Date(now.getTime() - 7 * 86_400_000).toISOString();
    const stats = connections.length
      ? await this.ingestion.messageStats(userId, since)
      : { imported: 0, unparsed: 0, rejected: 0, duplicate: 0 };
    return connections
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((c) => {
        const { tokenHash, ...connection } = c as StoredConnection;
        void tokenHash;
        return {
          connection,
          stale: isStale(c, now),
          lastSevenDays: c.status === 'REVOKED' ? { imported: 0, unparsed: 0, rejected: 0, duplicate: 0 } : stats,
        };
      });
  }

  async rotate(userId: string, connectionId: string): Promise<GmailSetup> {
    const current = (await this.ingestion.getConnection(userId, connectionId)) as StoredConnection | null;
    if (!current || current.status === 'REVOKED') throw new NotFoundError('Connection not found.');
    const token = this.newToken();
    const next: StoredConnection = {
      ...current,
      status: 'PENDING',
      tokenPrefix: token.slice(0, 6),
      tokenHash: this.hash(token),
    };
    await this.ingestion.writeConnection(userId, next, next.tokenHash!, current.tokenHash ?? null);
    return { connectionId, token, script: this.script() };
  }

  async revoke(userId: string, connectionId: string): Promise<void> {
    const current = (await this.ingestion.getConnection(userId, connectionId)) as StoredConnection | null;
    if (!current) throw new NotFoundError('Connection not found.');
    if (current.status === 'REVOKED') return;
    const next: StoredConnection = {
      ...current,
      status: 'REVOKED',
      revokedAt: this.clock.now().toISOString(),
      tokenHash: undefined,
    };
    await this.ingestion.writeConnection(userId, next, null, current.tokenHash ?? null);
  }

  senders(): string[] {
    return this.registry.senderAllowlist();
  }

  private script(): string {
    return this.scriptTemplate.replace(/__API_BASE__/g, this.apiBaseUrl.replace(/\/+$/, ''));
  }

  private newToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private hash(token: string): string {
    return sha256Hex(token);
  }
}
