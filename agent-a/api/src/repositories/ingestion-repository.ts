import type { Connection, ImportJob, ImportStatus, IngestMessage, IngestToken } from "@finance/shared";
import { Keys } from "../keys";
import { DynamoStore, isConditionFailure, stripKeys, type Item, type TransactItem } from "./dynamo-store";

/** A Connection plus the hash of its current token, so revoke and rotate know which `TOKEN#` item to delete. */
export interface ConnectionRecord extends Connection {
  userId: string;
  tokenHash?: string;
}

const MESSAGE_RETENTION_SECONDS = 90 * 24 * 3600;
const ROW_FINGERPRINT_RETENTION_SECONDS = 400 * 24 * 3600;
/** An upload that never arrived frees its file hash after this long (the presigned form expires sooner). */
const ABANDONED_UPLOAD_MS = 20 * 60 * 1000;

/** Ingestion table: connections, tokens, messages, imports, file hashes, row fingerprints. */
export class IngestionRepository {
  constructor(
    private readonly store: DynamoStore,
    private readonly table: string,
  ) {}

  // ---------- Idempotency claims ----------

  /**
   * Claims a statement file by its SHA-256. Returns false when the same file was already imported.
   * A file whose earlier import failed, or whose upload never arrived, can be claimed again.
   */
  async claimFile(userId: string, sha256: string, importId: string, now: Date): Promise<boolean> {
    try {
      await this.store.put(
        this.table,
        { PK: Keys.user(userId), SK: Keys.file(sha256), importId, status: "UPLOADING", createdAt: now.toISOString() },
        {
          expression: "attribute_not_exists(PK) OR #s = :failed OR (#s = :uploading AND createdAt < :abandoned)",
          names: { "#s": "status" },
          values: {
            ":failed": "FAILED",
            ":uploading": "UPLOADING",
            ":abandoned": new Date(now.getTime() - ABANDONED_UPLOAD_MS).toISOString(),
          },
        },
      );
      return true;
    } catch (error) {
      if (isConditionFailure(error)) return false;
      throw error;
    }
  }

  async setFileStatus(userId: string, sha256: string, status: ImportStatus): Promise<void> {
    await this.store.update(
      this.table,
      { PK: Keys.user(userId), SK: Keys.file(sha256) },
      { expression: "SET #s = :s", names: { "#s": "status" }, values: { ":s": status } },
    );
  }

  /** Claims a Gmail message by its Message-ID. Returns false for a repeat delivery. */
  async claimMessage(userId: string, message: IngestMessage): Promise<boolean> {
    try {
      await this.store.put(
        this.table,
        {
          PK: Keys.user(userId),
          SK: Keys.message(message.messageId),
          ...dropUndefined(message),
          ttl: Math.floor(Date.parse(message.receivedAt) / 1000) + MESSAGE_RETENTION_SECONDS,
        },
        { expression: "attribute_not_exists(PK)" },
      );
      return true;
    } catch (error) {
      if (isConditionFailure(error)) return false;
      throw error;
    }
  }

  /** Claims a CSV row fingerprint. Returns false when the row was already imported (overlapping statements). */
  async claimRow(userId: string, fingerprint: string, now: Date): Promise<boolean> {
    try {
      await this.store.put(
        this.table,
        { PK: Keys.user(userId), SK: Keys.rowFingerprint(fingerprint), ttl: Math.floor(now.getTime() / 1000) + ROW_FINGERPRINT_RETENTION_SECONDS },
        { expression: "attribute_not_exists(PK)" },
      );
      return true;
    } catch (error) {
      if (isConditionFailure(error)) return false;
      throw error;
    }
  }

  /** Releases a row claim when the row could not be saved, so a re-run imports it. */
  async releaseRow(userId: string, fingerprint: string): Promise<void> {
    await this.store.delete(this.table, { PK: Keys.user(userId), SK: Keys.rowFingerprint(fingerprint) });
  }

  /** Frees a message claim after a processing failure, so the script's next attempt is processed. */
  async releaseMessage(userId: string, messageId: string): Promise<void> {
    await this.store.delete(this.table, { PK: Keys.user(userId), SK: Keys.message(messageId) });
  }

  // ---------- Imports ----------

  async putImport(userId: string, job: ImportJob): Promise<void> {
    await this.store.put(this.table, { PK: Keys.user(userId), SK: Keys.importJob(job.id), ...dropUndefined(job) });
  }

  async updateImport(userId: string, job: ImportJob): Promise<void> {
    await this.store.put(this.table, { PK: Keys.user(userId), SK: Keys.importJob(job.id), ...dropUndefined(job) });
  }

  async getImport(userId: string, id: string): Promise<ImportJob | undefined> {
    const item = await this.store.get(this.table, { PK: Keys.user(userId), SK: Keys.importJob(id) });
    return item ? stripKeys<ImportJob>(item) : undefined;
  }

  // ---------- Messages ----------

  async updateMessage(userId: string, message: IngestMessage): Promise<void> {
    await this.store.put(this.table, {
      PK: Keys.user(userId),
      SK: Keys.message(message.messageId),
      ...dropUndefined(message),
      ttl: Math.floor(Date.parse(message.receivedAt) / 1000) + MESSAGE_RETENTION_SECONDS,
    });
  }

  async listUnparsed(userId: string): Promise<IngestMessage[]> {
    const items = await this.store.query(
      this.table,
      { pk: Keys.user(userId), beginsWith: "MSG#" },
      { filter: { expression: "#s = :u", names: { "#s": "status" }, values: { ":u": "unparsed" } } },
    );
    return items.map((i) => stripKeys<IngestMessage>(i, ["ttl"]));
  }

  // ---------- Tokens and connections ----------

  async getToken(hash: string): Promise<IngestToken | undefined> {
    const item = await this.store.get(this.table, { PK: Keys.token(hash), SK: Keys.ITEM });
    if (!item) return undefined;
    return { tokenHash: hash, userId: String(item.userId), connectionId: String(item.connectionId) };
  }

  async listConnections(userId: string): Promise<ConnectionRecord[]> {
    const items = await this.store.query(this.table, { pk: Keys.user(userId), beginsWith: "CONN#" });
    return items.map((i) => stripKeys<ConnectionRecord>(i));
  }

  async getConnection(userId: string, connectionId: string): Promise<ConnectionRecord | undefined> {
    const item = await this.store.get(this.table, { PK: Keys.user(userId), SK: Keys.connection(connectionId) });
    return item ? stripKeys<ConnectionRecord>(item) : undefined;
  }

  /**
   * Writes a connection and swaps its token in one TransactWriteItems: put the new `TOKEN#` item,
   * delete the old one, or both (rotation).
   */
  async writeConnection(connection: ConnectionRecord, putToken?: IngestToken, deleteTokenHash?: string): Promise<void> {
    const items: TransactItem[] = [
      {
        Put: {
          TableName: this.table,
          Item: { PK: Keys.user(connection.userId), SK: Keys.connection(connection.id), ...dropUndefined(connection) },
        },
      },
    ];
    if (putToken) {
      items.push({
        Put: {
          TableName: this.table,
          Item: { PK: Keys.token(putToken.tokenHash), SK: Keys.ITEM, userId: putToken.userId, connectionId: putToken.connectionId },
          ConditionExpression: "attribute_not_exists(PK)",
        },
      });
    }
    if (deleteTokenHash) {
      items.push({ Delete: { TableName: this.table, Key: { PK: Keys.token(deleteTokenHash), SK: Keys.ITEM } } });
    }
    await this.store.transactWrite(items);
  }

  /** Records that the script called in. `activate` moves a PENDING connection to ACTIVE. Revoked connections are left alone. */
  async touchConnection(userId: string, connectionId: string, at: Date, activate: boolean): Promise<void> {
    try {
      await this.store.update(
        this.table,
        { PK: Keys.user(userId), SK: Keys.connection(connectionId) },
        activate
          ? { expression: "SET lastSeenAt = :at, #s = :active", names: { "#s": "status" }, values: { ":at": at.toISOString(), ":active": "ACTIVE" } }
          : { expression: "SET lastSeenAt = :at", values: { ":at": at.toISOString() } },
        { expression: "attribute_exists(PK) AND #s <> :revoked", names: { "#s": "status" }, values: { ":revoked": "REVOKED" } },
      );
    } catch (error) {
      if (!isConditionFailure(error)) throw error;
    }
  }
}

function dropUndefined<T extends object>(obj: T): Item {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}
