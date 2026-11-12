import type { ImportStart } from '../../../shared/api-types';
import { MAX_IMPORT_BYTES } from '../../../shared/schemas';
import type { ImportJob } from '../../../shared/types';
import type { Clock } from '../clock';
import { ConflictError, NotFoundError, ValidationError } from '../http/errors';
import { randomId } from '../ids';
import type { IngestionRepository } from '../repositories/ingestion-repository';
import type { RawObjectStore } from '../repositories/raw-object-store';
import type { ReferenceRepository } from '../repositories/reference-repository';

/** Starts a statement import (01-S02): claims the file, then hands out a presigned POST. */
export class ImportService {
  constructor(
    private readonly ingestion: Pick<IngestionRepository, 'claimFile' | 'getFile' | 'putImport' | 'getImport'>,
    private readonly reference: Pick<ReferenceRepository, 'getAccount'>,
    private readonly raw: Pick<RawObjectStore, 'presignCsvUpload'>,
    private readonly clock: Clock,
  ) {}

  async createImport(
    userId: string,
    accountId: string,
    sha256: string,
    size: number,
    fileName?: string,
  ): Promise<ImportStart> {
    if (size < 1 || size > MAX_IMPORT_BYTES) throw new ValidationError('The file must be at most 1 MB.', { file: 'The file is over 1 MB' });
    const account = await this.reference.getAccount(userId, accountId);
    if (!account) throw new ValidationError('Choose one of your accounts.', { accountId: 'Unknown account' });
    const importId = randomId(16);
    const claimed = await this.ingestion.claimFile(userId, sha256, importId);
    if (!claimed) {
      const existing = await this.ingestion.getFile(userId, sha256);
      throw new ConflictError('This file was already imported.', 'ALREADY_IMPORTED', {
        importId: existing?.importId ?? null,
      });
    }
    const job: ImportJob = {
      id: importId,
      accountId,
      fileHash: sha256,
      fileName: fileName ?? null,
      status: 'UPLOADING',
      failureReason: null,
      templateId: null,
      statementIban: null,
      statementDate: null,
      imported: 0,
      merged: 0,
      skipped: 0,
      transfers: 0,
      checksum: null,
      rowErrors: [],
      createdAt: this.clock.now().toISOString(),
    };
    await this.ingestion.putImport(userId, job);
    const upload = await this.raw.presignCsvUpload(userId, importId, MAX_IMPORT_BYTES);
    return { importId, upload };
  }

  async getImport(userId: string, importId: string): Promise<ImportJob> {
    const job = await this.ingestion.getImport(userId, importId);
    if (!job) throw new NotFoundError('Import not found.');
    return job;
  }
}
