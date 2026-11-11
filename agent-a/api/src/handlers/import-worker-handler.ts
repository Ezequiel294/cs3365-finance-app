import type { S3Event } from 'aws-lambda';
import type { ServiceFactory } from '../service-factory';

const KEY_PATTERN = /^imports\/([^/]+)\/([A-Za-z0-9-]+)\.csv$/;

/** The `ImportWorkerFn` entry point: one S3 `ObjectCreated` event per uploaded statement. */
export class ImportWorkerHandler {
  constructor(private readonly factory: ServiceFactory) {}

  async handler(event: S3Event): Promise<void> {
    for (const record of event.Records ?? []) {
      const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
      const m = KEY_PATTERN.exec(key);
      if (!m) {
        console.warn(JSON.stringify({ msg: 'Ignoring object outside imports/<userId>/<importId>.csv' }));
        continue;
      }
      const [, userId, importId] = m;
      await this.processOne(userId, importId);
    }
  }

  private async processOne(userId: string, importId: string): Promise<void> {
    const ingestion = this.factory.ingestionRepository();
    const job = await ingestion.getImport(userId, importId);
    if (!job) {
      console.warn(JSON.stringify({ msg: 'Import not found for uploaded object', importId }));
      return;
    }
    if (job.status !== 'UPLOADING') {
      console.warn(JSON.stringify({ msg: 'Import already processed', importId, status: job.status }));
      return;
    }
    await ingestion.updateImport(userId, { ...job, status: 'PROCESSING', updatedAt: new Date().toISOString() });
    try {
      const done = await this.factory.ingestPipeline().processCsv(userId, importId);
      console.log(
        JSON.stringify({ msg: 'Import finished', importId, status: done.status, imported: done.imported, skipped: done.skipped, rowErrors: done.rowErrors.length }),
      );
    } catch (err) {
      console.error(JSON.stringify({ msg: 'Import failed', importId, error: (err as Error).name }));
      const now = new Date().toISOString();
      await ingestion.updateImport(userId, {
        ...job,
        status: 'FAILED',
        failureReason: 'The file could not be processed. Try uploading it again.',
        updatedAt: now,
      });
      await ingestion.setFileStatus(userId, job.fileHash, 'FAILED');
    }
  }
}
