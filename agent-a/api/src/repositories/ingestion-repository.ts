import type { Connection, DeliveryStats, ImportJob, IngestMessage } from '@finance/shared';
import { GLOBAL_SK, Keys } from '../keys';
import { ConditionFailedError, DynamoStore, strip, type TransactItem } from './dynamo-store';

export interface IngestToken {
  tokenHash: string;
  userId: string;
  connectionId: string;
}

export interface FileClaim {
  fileHash: string;
  importId: string;
  status: string;
  claimedAt: string;
}

/** Stored connection: the view type plus the hash of its current token (needed to revoke it). */
export interface StoredConnection extends Connection {
  tokenHash?: string | null;
}

/** An upload claim that never received a file is reclaimable after this long. */
export const STALE_UPLOAD_MS = 10 * 60 * 1000;

export class IngestionRepository {
  constructor(
    private readonly store: DynamoStore,
    private readonly table: string,
  ) {}

  // ---------- Statement files ----------

  /**
   * Claims a file for a new import. Succeeds when no claim exists, when the last
   * import of the file FAILED, or when an upload was started but never arrived.
   */
  async claimFile(userId: string, sha256: string, importId: string, now: Date = new Date()): Promise<boolean> {
    try {
      await this.store.put(
        this.table,
        {
          PK: Keys.user(userId),
          SK: Keys.file(sha256),
          fileHash: sha256,
          importId,
          status: 'UPLOADING',
          claimedAt: now.toISOString(),
        },
        {
          condition: 'attribute_not_exists(PK) OR #status = :failed OR (#status = :uploading AND claimedAt < :stale)',
          names: { '#status': 'status' },
          values: {
            ':failed': 'FAILED',
            ':uploading': 'UPLOADING',
            ':stale': new Date(now.getTime() - STALE_UPLOAD_MS).toISOString(),
          },
        },
      );
      return true;
    } catch (err) {
      if (err instanceof ConditionFailedError) return false;
      throw err;
    }
  }

  async getFileClaim(userId: string, sha256: string): Promise<FileClaim | undefined> {
    return strip<FileClaim>(await this.store.get(this.table, { PK: Keys.user(userId), SK: Keys.file(sha256) }, true));
  }

  async setFileStatus(userId: string, sha256: string, status: string): Promise<void> {
    await this.store.update(
      this.table,
      { PK: Keys.user(userId), SK: Keys.file(sha256) },
      { update: 'SET #status = :s', names: { '#status': 'status' }, values: { ':s': status } },
    );
  }

  /** The conditional put of `ROWFP#<hash>`, written in the same transaction as the row's TXN. */
  rowClaimItem(userId: string, fingerprint: string, importId: string): TransactItem {
    return {
      Put: {
        TableName: this.table,
        Item: { PK: Keys.user(userId), SK: Keys.rowFingerprint(fingerprint), importId },
        ConditionExpression: 'attribute_not_exists(PK)',
      },
    };
  }

  async putImport(userId: string, job: ImportJob): Promise<void> {
    await this.store.put(this.table, { PK: Keys.user(userId), SK: Keys.importJob(job.id), ...job });
  }

  async updateImport(userId: string, job: ImportJob): Promise<void> {
    await this.store.put(this.table, { PK: Keys.user(userId), SK: Keys.importJob(job.id), ...job });
  }

  async getImport(userId: string, id: string): Promise<ImportJob | undefined> {
    return strip<ImportJob>(await this.store.get(this.table, { PK: Keys.user(userId), SK: Keys.importJob(id) }, true));
  }

  // ---------- Emails ----------

  /** `attribute_not_exists` put of `MSG#<Message-ID>`; false when the email was seen before. */
  async claimMessage(userId: string, message: IngestMessage): Promise<boolean> {
    try {
      await this.store.put(
        this.table,
        { PK: Keys.user(userId), SK: Keys.message(message.messageId), ...message },
        { condition: 'attribute_not_exists(PK)' },
      );
      return true;
    } catch (err) {
      if (err instanceof ConditionFailedError) return false;
      throw err;
    }
  }

  async getMessage(userId: string, messageId: string): Promise<IngestMessage | undefined> {
    return strip<IngestMessage>(await this.store.get(this.table, { PK: Keys.user(userId), SK: Keys.message(messageId) }, true));
  }

  async updateMessage(userId: string, message: IngestMessage): Promise<void> {
    await this.store.put(this.table, { PK: Keys.user(userId), SK: Keys.message(message.messageId), ...message });
  }

  async deleteMessage(userId: string, messageId: string): Promise<void> {
    await this.store.delete(this.table, { PK: Keys.user(userId), SK: Keys.message(messageId) });
  }

  async listUnparsed(userId: string): Promise<IngestMessage[]> {
    const items = await this.store.queryAll(this.table, 'PK = :pk AND begins_with(SK, :p)', {
      values: { ':pk': Keys.user(userId), ':p': 'MSG#', ':s': 'unparsed' },
      names: { '#status': 'status' },
      filter: '#status = :s',
    });
    return items.map((i) => strip<IngestMessage>(i)!);
  }

  /** Counts the user's `MSG#` items by status since a date. */
  async messageStats(userId: string, since: string): Promise<DeliveryStats> {
    const items = await this.store.queryAll(this.table, 'PK = :pk AND begins_with(SK, :p)', {
      values: { ':pk': Keys.user(userId), ':p': 'MSG#', ':since': since },
      filter: 'receivedAt >= :since',
    });
    const stats: DeliveryStats = { imported: 0, unparsed: 0, rejected: 0, duplicate: 0 };
    for (const item of items) {
      const status = item.status as keyof DeliveryStats;
      if (status in stats) stats[status] += 1;
    }
    return stats;
  }

  // ---------- Connections and tokens ----------

  async getToken(hash: string): Promise<IngestToken | undefined> {
    return strip<IngestToken>(await this.store.get(this.table, { PK: Keys.token(hash), SK: GLOBAL_SK }, true));
  }

  async listConnections(userId: string): Promise<StoredConnection[]> {
    const items = await this.store.queryAll(this.table, 'PK = :pk AND begins_with(SK, :p)', {
      values: { ':pk': Keys.user(userId), ':p': 'CONN#' },
    });
    return items.map((i) => strip<StoredConnection>(i)!);
  }

  async getConnection(userId: string, connectionId: string): Promise<StoredConnection | undefined> {
    return strip<StoredConnection>(
      await this.store.get(this.table, { PK: Keys.user(userId), SK: Keys.connection(connectionId) }, true),
    );
  }

  /** One `TransactWriteItems`: the connection, plus putting a new token and/or deleting an old one. */
  async writeConnection(
    userId: string,
    connection: StoredConnection,
    putToken?: IngestToken,
    deleteTokenHash?: string | null,
  ): Promise<void> {
    const items: TransactItem[] = [
      { Put: { TableName: this.table, Item: { PK: Keys.user(userId), SK: Keys.connection(connection.id), ...connection } } },
    ];
    if (putToken) {
      items.push({
        Put: {
          TableName: this.table,
          Item: { PK: Keys.token(putToken.tokenHash), SK: GLOBAL_SK, ...putToken },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      });
    }
    if (deleteTokenHash) {
      items.push({ Delete: { TableName: this.table, Key: { PK: Keys.token(deleteTokenHash), SK: GLOBAL_SK } } });
    }
    await this.store.transactWrite(items);
  }

  /** Records that the script was seen; a revoked connection stays revoked. */
  async touchConnection(userId: string, connectionId: string, at: string): Promise<void> {
    try {
      await this.store.update(
        this.table,
        { PK: Keys.user(userId), SK: Keys.connection(connectionId) },
        {
          update: 'SET lastSeenAt = :at, #status = :active',
          condition: 'attribute_exists(PK) AND #status <> :revoked',
          names: { '#status': 'status' },
          values: { ':at': at, ':active': 'ACTIVE', ':revoked': 'REVOKED' },
        },
      );
    } catch (err) {
      if (!(err instanceof ConditionFailedError)) throw err;
    }
  }
}
