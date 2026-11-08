import type { S3Event } from "aws-lambda";
import { RawObjectStore } from "../repositories/raw-object-store";
import type { ServiceFactory } from "../service-factory";

/** `ImportWorkerFn` entry point: started by the S3 ObjectCreated event of an uploaded CSV statement. */
export class ImportWorkerHandler {
  constructor(private readonly services: ServiceFactory) {}

  async handler(event: S3Event): Promise<void> {
    for (const record of event.Records ?? []) {
      const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
      const target = RawObjectStore.parseCsvKey(key);
      if (!target) continue;
      const { userId, importId } = target;
      const imports = this.services.importService();
      if (!(await imports.markProcessing(userId, importId))) continue;
      try {
        const job = await this.services.ingestPipeline().processCsv(userId, importId);
        console.log(JSON.stringify({ msg: "import finished", importId, status: job?.status, imported: job?.imported, merged: job?.merged, skipped: job?.skipped, errors: job?.rowErrors.length }));
      } catch (error) {
        console.error(JSON.stringify({ msg: "import failed", importId, error: (error as Error)?.name }));
        const repo = this.services.ingestionRepository();
        const job = await repo.getImport(userId, importId);
        if (job && job.status !== "DONE") {
          await repo.updateImport(userId, { ...job, status: "FAILED", failureReason: "the file could not be processed", updatedAt: new Date().toISOString() });
          await repo.setFileStatus(userId, job.fileHash, "FAILED");
        }
      }
    }
  }
}
