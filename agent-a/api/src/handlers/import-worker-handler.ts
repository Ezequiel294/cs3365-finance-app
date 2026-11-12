import type { S3Event } from 'aws-lambda';
import { ServiceFactory } from '../service-factory';

const KEY_PATTERN = /^imports\/([A-Za-z0-9-]+)\/([a-z0-9]+)\.csv$/;

/** The ImportWorkerFn entry point: one S3 ObjectCreated event per uploaded statement. */
export class ImportWorkerHandler {
  constructor(private readonly factory: ServiceFactory = new ServiceFactory()) {}

  handler = async (event: S3Event): Promise<void> => {
    for (const record of event.Records ?? []) {
      const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
      const m = KEY_PATTERN.exec(key);
      if (!m) {
        console.warn(JSON.stringify({ msg: 'ignored object', reason: 'unexpected key' }));
        continue;
      }
      const [, userId, importId] = m as unknown as [string, string, string];
      const ingestion = this.factory.ingestionRepository();
      const job = await ingestion.getImport(userId, importId);
      if (!job) {
        console.warn(JSON.stringify({ msg: 'import not found', importId }));
        continue;
      }
      if (job.status !== 'UPLOADING') {
        console.warn(JSON.stringify({ msg: 'import already handled', importId, status: job.status }));
        continue;
      }
      await ingestion.updateImport(userId, { ...job, status: 'PROCESSING' });
      const result = await this.factory.ingestPipeline().processCsv(userId, importId);
      console.log(
        JSON.stringify({
          msg: 'import finished',
          importId,
          status: result.status,
          imported: result.imported,
          merged: result.merged,
          skipped: result.skipped,
          rowErrors: result.rowErrors.length,
        }),
      );
    }
  };
}
