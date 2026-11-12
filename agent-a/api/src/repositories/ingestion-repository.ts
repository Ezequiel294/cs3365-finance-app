import type { DeliveryStats } from '../../../shared/api-types';
import type {
  Connection,
  FileClaim,
  ImportJob,
  ImportStatus,
  IngestMessage,
  IngestToken,
} from '../../../shared/types';
import { Keys } from '../keys';
import { DynamoStore, type TransactItem, isConditionalFailure, stripKeys } from './dynamo-store';

/** Ingestion table: connections, tokens, messages, imports, file and row claims. */
export class IngestionRepository {
  constructor(
    private readonly store: DynamoStore,
    private readonly table: string,
  ) {}

  /** Claim FILE#<sha256> for a new import; reclaimable when the last import FAILED. */
  async claimFile(userId: string, sha256: string, importId: string): Promise<boolean> {
    try {
      await this.store.put(
        this.table,
        { PK: Keys.user(userId), SK: Keys.file(sha256), fileHash: sha256, importId, status: 'UPLOADING' },
        {
          expression: 'attribute_not_exists(PK) OR #s = :failed',
          names: { '#s': 'status' },
          values: { ':failed': 'FAILED' },
        },
      );
      return true;
    } catch (e) {
      if (isConditionalFailure(e)) return false;
      throw e;
    }
  }

  async getFile(userId: string, sha256: string): Promise<FileClaim | null> {
    return stripKeys<FileClaim>(await this.store.get(this.table, { PK: Keys.user(userId), SK: Keys.file(sha256) }, true));
  }

  async setFileStatus(userId: string, sha256: string, status: ImportStatus): Promise<void> {
    await this.store.update(
      this.table,
      { PK: Keys.user(userId), SK: Keys.file(sha256) },
      { update: 'SET #s = :s', names: { '#s': 'status' }, values: { ':s': status } },
    );
  }

  /** Put MSG#<messageId> if it does not exist yet. */
  async claimMessage(userId: string, message: IngestMessage): Promise<boolean> {
    try {
      await this.store.put(
        this.table,
        { PK: Keys.user(userId), SK: Keys.message(message.messageId), ...message },
        { expression: 'attribute_not_exists(PK)' },
      );
      return true;
    } catch (e) {
      if (isConditionalFailure(e)) return false;
      throw e;
    }
  }

  /** Record that an already-known message was delivered again ("Already known"). */
  async markRepeat(userId: string, messageId: string, at: string): Promise<void> {
    await this.store.update(
      this.table,
      { PK: Keys.user(userId), SK: Keys.message(messageId) },
      { update: 'SET lastRepeatAt = :a ADD repeats :one', values: { ':a': at, ':one': 1 } },
    );
  }

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
    await this.putImport(userId, job);
  }

  async getImport(userId: string, id: string): Promise<ImportJob | null> {
    return stripKeys<ImportJob>(await this.store.get(this.table, { PK: Keys.user(userId), SK: Keys.importJob(id) }, true));
  }

  async getMessage(userId: string, messageId: string): Promise<IngestMessage | null> {
    return stripKeys<IngestMessage>(
      await this.store.get(this.table, { PK: Keys.user(userId), SK: Keys.message(messageId) }, true),
    );
  }

  async updateMessage(userId: string, message: IngestMessage): Promise<void> {
    await this.store.put(this.table, { PK: Keys.user(userId), SK: Keys.message(message.messageId), ...message });
  }

  async deleteMessage(userId: string, messageId: string): Promise<void> {
    await this.store.delete(this.table, { PK: Keys.user(userId), SK: Keys.message(messageId) });
  }

  async listUnparsed(userId: string): Promise<IngestMessage[]> {
    const items = await this.store.query(
      this.table,
      { expression: 'PK = :pk AND begins_with(SK, :p)', values: { ':pk': Keys.user(userId), ':p': 'MSG#' } },
      { filter: '#s = :s', names: { '#s': 'status' }, values: { ':s': 'unparsed' } },
    );
    return items
      .map((i) => stripKeys<IngestMessage>(i)!)
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  }

  async messageStats(userId: string, since: string): Promise<DeliveryStats> {
    const items = await this.store.query(this.table, {
      expression: 'PK = :pk AND begins_with(SK, :p)',
      values: { ':pk': Keys.user(userId), ':p': 'MSG#' },
    });
    const stats: DeliveryStats = { imported: 0, unparsed: 0, rejected: 0, duplicate: 0 };
    for (const i of items) {
      if (i.receivedAt >= since) {
        if (i.status === 'imported') stats.imported++;
        else if (i.status === 'unparsed') stats.unparsed++;
        else if (i.status === 'rejected') stats.rejected++;
      }
      if (i.lastRepeatAt && i.lastRepeatAt >= since) stats.duplicate++;
    }
    return stats;
  }

  async getToken(hash: string): Promise<IngestToken | null> {
    const item = await this.store.get(this.table, { PK: Keys.token(hash), SK: Keys.TOKEN_SK }, true);
    if (!item) return null;
    return { tokenHash: hash, userId: item.userId, connectionId: item.connectionId };
  }

  async getConnection(userId: string, connectionId: string): Promise<Connection | null> {
    return stripKeys<Connection>(
      await this.store.get(this.table, { PK: Keys.user(userId), SK: Keys.connection(connectionId) }, true),
    );
  }

  async listConnections(userId: string): Promise<Connection[]> {
    const items = await this.store.query(this.table, {
      expression: 'PK = :pk AND begins_with(SK, :p)',
      values: { ':pk': Keys.user(userId), ':p': 'CONN#' },
    });
    return items.map((i) => stripKeys<Connection>(i)!);
  }

  /** One TransactWriteItems: put the connection, put a new token hash, delete an old one. */
  async writeConnection(
    userId: string,
    connection: Connection,
    putToken: string | null,
    deleteToken: string | null,
  ): Promise<void> {
    const items: TransactItem[] = [
      { Put: { TableName: this.table, Item: { PK: Keys.user(userId), SK: Keys.connection(connection.id), ...connection } } },
    ];
    if (putToken) {
      items.push({
        Put: {
          TableName: this.table,
          Item: { PK: Keys.token(putToken), SK: Keys.TOKEN_SK, userId, connectionId: connection.id },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      });
    }
    if (deleteToken) {
      items.push({ Delete: { TableName: this.table, Key: { PK: Keys.token(deleteToken), SK: Keys.TOKEN_SK } } });
    }
    await this.store.transactWrite(items);
  }

  /** Record a sign of life from the script; a PENDING connection becomes ACTIVE. */
  async touchConnection(userId: string, connectionId: string, at: string): Promise<void> {
    try {
      await this.store.update(
        this.table,
        { PK: Keys.user(userId), SK: Keys.connection(connectionId) },
        {
          update: 'SET lastSeenAt = :at, #s = :active',
          names: { '#s': 'status' },
          values: { ':at': at, ':active': 'ACTIVE' },
        },
        { expression: 'attribute_exists(PK) AND #s <> :revoked', values: { ':revoked': 'REVOKED' } },
      );
    } catch (e) {
      if (!isConditionalFailure(e)) throw e;
    }
  }
}
