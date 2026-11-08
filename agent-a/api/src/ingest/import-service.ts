import type { ImportJob, ImportStart } from "@finance/shared";
import type { Clock } from "../clock";
import { ConflictError, NotFoundError, ValidationError } from "../http/errors";
import { randomId } from "../ids";
import type { IngestionRepository } from "../repositories/ingestion-repository";
import type { RawObjectStore } from "../repositories/raw-object-store";
import type { ReferenceRepository } from "../repositories/reference-repository";

export const MAX_CSV_BYTES = 1024 * 1024;

/** Starts a CSV import: claims the file hash and hands the browser a presigned upload form. */
export class ImportService {
  constructor(
    private readonly ingestion: IngestionRepository,
    private readonly raw: RawObjectStore,
    private readonly reference: ReferenceRepository,
    private readonly clock: Clock,
  ) {}

  async createImport(userId: string, accountId: string, sha256: string, fileName?: string): Promise<ImportStart> {
    const account = await this.reference.getAccount(userId, accountId);
    if (!account) throw new ValidationError("unknown account", "UNKNOWN_ACCOUNT");
    const now = this.clock.now();
    const importId = randomId(16);
    if (!(await this.ingestion.claimFile(userId, sha256, importId, now))) {
      throw new ConflictError("This file was already imported", "ALREADY_IMPORTED");
    }
    const job: ImportJob = {
      id: importId,
      accountId,
      fileHash: sha256,
      fileName: fileName?.slice(0, 200),
      status: "UPLOADING",
      imported: 0,
      merged: 0,
      skipped: 0,
      rowErrors: [],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    await this.ingestion.putImport(userId, job);
    const upload = await this.raw.presignCsvUpload(userId, importId, MAX_CSV_BYTES);
    return { importId, upload, maxBytes: MAX_CSV_BYTES };
  }

  async getImport(userId: string, importId: string): Promise<ImportJob> {
    const job = await this.ingestion.getImport(userId, importId);
    if (!job) throw new NotFoundError("import not found");
    return job;
  }

  /** Called by ImportWorkerFn when the upload lands. */
  async markProcessing(userId: string, importId: string): Promise<boolean> {
    const job = await this.ingestion.getImport(userId, importId);
    // PROCESSING is accepted too, so a retried event resumes an interrupted import (ROWFP# skips finished rows).
    if (!job || (job.status !== "UPLOADING" && job.status !== "PROCESSING")) return false;
    await this.ingestion.updateImport(userId, { ...job, status: "PROCESSING", updatedAt: this.clock.now().toISOString() });
    return true;
  }
}
