import type { APIGatewayProxyEventV2, Context, S3Event } from 'aws-lambda';
import { ApiHandler } from './handlers/api-handler';
import { ImportWorkerHandler } from './handlers/import-worker-handler';
import { ServiceFactory } from './service-factory';

/*
 * One code bundle, two Lambda entry points: `apiHandler` (ApiFn) and
 * `importWorkerHandler` (ImportWorkerFn). Each container builds its factory once.
 */
let factory: ServiceFactory | undefined;
let api: ApiHandler | undefined;
let worker: ImportWorkerHandler | undefined;

const getFactory = () => (factory ??= new ServiceFactory());

export async function apiHandler(event: APIGatewayProxyEventV2, context: Context) {
  api ??= new ApiHandler(getFactory());
  return api.handler(event, context);
}

export async function importWorkerHandler(event: S3Event): Promise<void> {
  worker ??= new ImportWorkerHandler(getFactory());
  return worker.handler(event);
}
