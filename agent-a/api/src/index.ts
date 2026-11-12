/**
 * The one code bundle for both Lambdas:
 *   ApiFn          → handler "index.apiHandler"
 *   ImportWorkerFn → handler "index.importWorkerHandler"
 * Each Lambda container builds its ServiceFactory lazily on the first call.
 */
import type { APIGatewayProxyEventV2, Context, S3Event } from 'aws-lambda';
import { ApiHandler } from './handlers/api-handler';
import { ImportWorkerHandler } from './handlers/import-worker-handler';

let api: ApiHandler | null = null;
let worker: ImportWorkerHandler | null = null;

export const apiHandler = (event: APIGatewayProxyEventV2, context: Context) => {
  api ??= new ApiHandler();
  return api.handler(event, context);
};

export const importWorkerHandler = (event: S3Event) => {
  worker ??= new ImportWorkerHandler();
  return worker.handler(event);
};
