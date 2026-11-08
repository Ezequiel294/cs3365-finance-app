import type { APIGatewayProxyEventV2, Context, S3Event } from "aws-lambda";
import { Config } from "./config";
import { ApiHandler } from "./handlers/api-handler";
import { ImportWorkerHandler } from "./handlers/import-worker-handler";
import { ServiceFactory } from "./service-factory";

// One code bundle, two Lambda entry points: ApiFn (`apiHandler`) and ImportWorkerFn (`importWorkerHandler`).

let factory: ServiceFactory | undefined;
let api: ApiHandler | undefined;
let worker: ImportWorkerHandler | undefined;

function services(): ServiceFactory {
  // Config throws when an environment variable is missing, so a misconfigured Lambda fails on its first request.
  factory ??= new ServiceFactory(new Config());
  return factory;
}

export async function apiHandler(event: APIGatewayProxyEventV2, context: Context) {
  api ??= new ApiHandler(services());
  return api.handler(event, context);
}

export async function importWorkerHandler(event: S3Event): Promise<void> {
  worker ??= new ImportWorkerHandler(services());
  return worker.handler(event);
}
