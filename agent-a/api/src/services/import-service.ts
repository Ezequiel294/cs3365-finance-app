import { MAX_IMPORT_BYTES, type ImportJob, type ImportStart } from '@finance/shared';
import type { Clock } from '../clock';
import { ConflictError, NotFoundError, ValidationError } from '../errors';
import type { IngestionRepository } from '../repositories/ingestion-repository';
import type { RawObjectStore } from '../repositories/raw-object-store';
import type { ReferenceRepository } from '../repositories/reference-repository';

/** Starts statement imports (01-S02). The file itself goes from the browser straight to S3. */
export class ImportService {
  constructor(
    private readonly ingestion: IngestionRepository,
    private readonly reference: ReferenceRepository,
    private readonly raw: RawObjectStore,
    private readonly clock: Clock,
  ) {}

  async createImport(userId: string, accountId: string, sha256: string, size: number, fileName?: string): Promise<ImportStart> {
    if (size < 1 || size > MAX_IMPORT_BYTES) throw new ValidationError('The file must be between 1 byte and 1 MiB');
    const account = await this.reference.getAccount(userId, accountId);
    if (!account) throw new ValidationError('Unknown account');
    const importId = crypto.randomUUID();
    const now = this.clock.now();
    if (!(await this.ingestion.claimFile(userId, sha256, importId, now))) {
      const claim = await this.ingestion.getFileClaim(userId, sha256);
      throw new ConflictError('This file was already imported or is being imported', { importId: claim?.importId });
    }
    const job: ImportJob = {
      id: importId,
      accountId,
      fileName: fileName ?? null,
      fileHash: sha256,
      status: 'UPLOADING',
      imported: 0,
      merged: 0,
      skipped: 0,
      transfers: 0,
      rowErrors: [],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    await this.ingestion.putImport(userId, job);
    const upload = await this.raw.presignCsvUpload(userId, importId, MAX_IMPORT_BYTES);
    return { importId, upload, maxBytes: MAX_IMPORT_BYTES };
  }

  async getImport(userId: string, importId: string): Promise<ImportJob> {
    const job = await this.ingestion.getImport(userId, importId);
    if (!job) throw new NotFoundError('Import not found');
    return job;
  }
}
