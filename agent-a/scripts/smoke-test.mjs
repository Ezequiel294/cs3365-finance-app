#!/usr/bin/env node
// Post-deploy smoke test that needs no Cognito user. It invokes the deployed ApiFn directly with
// API Gateway v2 events carrying a synthetic `sub` claim (the JWT authorizer is bypassed only
// because this is a direct Lambda invoke), checks the main flows, exercises the Gmail token through
// the real HTTP API, and deletes every item it created. It prints statuses and summary fields only:
// no tokens and no secrets.
//
// Usage (AWS credentials and region in the environment):
//   node scripts/smoke-test.mjs <ApiFunctionName> <ApiUrl>
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [fn, apiUrl] = process.argv.slice(2);
if (!fn || !apiUrl) {
  console.error("usage: node scripts/smoke-test.mjs <ApiFunctionName> <ApiUrl>");
  process.exit(2);
}
const USER = "00000000-smoke-test-0000-000000000000";
const dir = mkdtempSync(join(process.env.SMOKE_TMP ?? tmpdir(), "smoke-"));
const aws = (args) => execFileSync("aws", [...args, "--output", "json"], { encoding: "utf8" });
let failures = 0;
const uploadedKeys = [];
const check = (label, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
};

function invoke(method, path, body, query = "") {
  const event = {
    version: "2.0",
    routeKey: "ANY /api/{proxy+}",
    rawPath: path,
    rawQueryString: query,
    headers: { host: new URL(apiUrl).host, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    isBase64Encoded: false,
    requestContext: {
      domainName: new URL(apiUrl).host,
      http: { method, path, protocol: "HTTP/1.1", sourceIp: "127.0.0.1", userAgent: "smoke-test" },
      requestId: `smoke-${Date.now()}`,
      routeKey: "ANY /api/{proxy+}",
      stage: "$default",
      authorizer: { jwt: { claims: { sub: USER }, scopes: [] } },
    },
  };
  const payload = join(dir, "event.json");
  const out = join(dir, "out.json");
  writeFileSync(payload, JSON.stringify(event));
  aws(["lambda", "invoke", "--function-name", fn, "--cli-binary-format", "raw-in-base64-out", "--payload", `fileb://${payload}`, out]);
  const res = JSON.parse(readFileSync(out, "utf8"));
  return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : undefined };
}

async function http(method, path, token, body) {
  const res = await fetch(`${apiUrl}${path}`, { method, headers: token ? { authorization: `Bearer ${token}` } : {}, body });
  return res.status;
}

try {
  const account = invoke("POST", "/api/accounts", { name: "Smoke CRC", bank: "Smoke", type: "credit_card", currency: "CRC", last4: "9999" });
  check("create account", account.status === 201, `HTTP ${account.status}`);

  const txn = invoke("POST", "/api/transactions", {
    accountId: account.body.id,
    amountMinor: 1_400_000,
    localDate: "2026-10-14",
    merchantRaw: "AUTOMERCADO ESCAZU 042",
  });
  check("manual CRC entry converted at the BCCR rate", txn.status === 201 && txn.body.fxRate > 100, `HTTP ${txn.status}, rate ${txn.body?.fxRate} on ${txn.body?.fxDate}, USD cents ${txn.body?.amountUsdCents}, category ${txn.body?.categoryId}`);

  const weekend = invoke("POST", "/api/transactions", { accountId: account.body.id, amountMinor: 500_000, localDate: "2026-10-11" });
  // BCCR publishes a value for weekend days too; when it does not, the provider falls back to the latest earlier rate.
  check("a weekend date gets a rate on or before that date", weekend.status === 201 && weekend.body.fxDate <= "2026-10-11", `HTTP ${weekend.status}, rate date ${weekend.body?.fxDate}`);

  const spending = invoke("GET", "/api/analytics/spending", undefined, "period=month&month=2026-10&groupBy=category");
  check("spending by category", spending.status === 200 && spending.body.categories.length === 2, spending.body?.categories?.map((c) => `${c.name} ${Math.round(c.share * 100)}%`).join(", "));

  const review = invoke("GET", "/api/review");
  check("review inbox counts the uncategorized entry", review.status === 200 && review.body.count === 1, `count ${review.body?.count}`);

  const budget = invoke("POST", "/api/budgets", { name: "Smoke groceries", categoryIds: ["groceries"], period: "MONTHLY", limitCents: 2000 });
  check("create budget", budget.status === 201, `HTTP ${budget.status}`);
  const totals = invoke("GET", "/api/analytics/spending", undefined, "period=month&from=2026-08&to=2026-10");
  check("monthly totals fill empty months with 0", totals.status === 200 && totals.body.months.length === 3 && totals.body.months[0].expenseCents === 0);

  const broker = invoke("PUT", "/api/brokers/brk-smoke", { name: "Smoke broker", flatCents: 15, percentBps: 0, version: 0 });
  check("create broker", broker.status === 200, `HTTP ${broker.status}`);
  const buy = invoke("POST", "/api/investments/transactions", { brokerId: "brk-smoke", type: "BUY", localDate: "2026-10-01", ticker: "VOO", quantityMicro: 1_000_000, grossCents: 50_000, commissionCents: 15 });
  check("record a buy", buy.status === 201 && buy.body.holding?.costBasisCents === 50_015, `HTTP ${buy.status}`);
  const valuation = invoke("GET", "/api/portfolio/valuation");
  check("valuation reports prices as unavailable without an API key", valuation.status === 200, `HTTP ${valuation.status}, incomplete ${valuation.body?.incomplete}`);

  const gmail = invoke("POST", "/api/connections/gmail", {});
  check("connect Gmail returns a one-time token and the script", gmail.status === 201 && gmail.body.script.includes(apiUrl));
  const token = gmail.body.token;
  check("ingest config accepts the token", (await http("GET", "/ingest/gmail/config", token)) === 200);
  const unsigned = [
    "From: Example Bank <alertas@example-bank.test>",
    "Subject: Notificacion de transaccion",
    `Message-ID: <smoke-${Date.now()}@example-bank.test>`,
    "",
    "Monto: CRC 1,000.00",
  ].join("\r\n");
  const ingestRes = await fetch(`${apiUrl}/ingest/gmail`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "text/plain" }, body: unsigned });
  const ingestBody = await ingestRes.json();
  check("an unsigned email is stored, claimed, and rejected by the DKIM check", ingestRes.status === 200 && ingestBody.status === "rejected", `HTTP ${ingestRes.status} ${ingestBody.status}`);
  check("heartbeat accepted", (await http("POST", "/ingest/gmail/heartbeat", token, "")) === 200);
  const list = invoke("GET", "/api/connections");
  check("connection is ACTIVE with lastSeenAt", list.body.items[0]?.status === "ACTIVE" && !!list.body.items[0]?.lastSeenAt);
  const revoked = invoke("DELETE", `/api/connections/${gmail.body.connectionId}`);
  check("revoke", revoked.status === 200);
  check("revoked token is rejected with 401", (await http("POST", "/ingest/gmail", token, "From: a@b.test\r\n\r\nhi")) === 401);

  // CSV import: presigned POST straight to S3, then ImportWorkerFn runs from the S3 event.
  const csv = readFileSync(new URL("../api/test/fixtures/example-bank-statement.csv", import.meta.url));
  const sha = (await import("node:crypto")).createHash("sha256").update(csv).digest("hex");
  const start = invoke("POST", "/api/imports", { accountId: account.body.id, fileName: "synthetic.csv", sha256: sha });
  check("start import returns a presigned upload form", start.status === 201 && !!start.body.upload?.url, `HTTP ${start.status}`);
  const form = new FormData();
  for (const [k, v] of Object.entries(start.body.upload.fields)) form.append(k, v);
  form.append("file", new Blob([csv], { type: "text/csv" }), "synthetic.csv");
  const upload = await fetch(start.body.upload.url, { method: "POST", body: form });
  check("upload to S3 with the presigned POST", upload.status === 204, `HTTP ${upload.status}`);
  uploadedKeys.push(start.body.upload.fields.key);
  let job;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    job = invoke("GET", `/api/imports/${start.body.importId}`).body;
    if (job.status === "DONE" || job.status === "FAILED") break;
  }
  check(
    "ImportWorkerFn imported the readable rows and reported the rest",
    job?.status === "DONE" && job.imported + job.merged === 5 && job.rowErrors.length === 2,
    `${job?.status}, imported ${job?.imported}, merged ${job?.merged}, skipped ${job?.skipped}, row errors ${job?.rowErrors?.map((e) => `${e.row}: ${e.reason}`).join("; ")}`,
  );
  const again = invoke("POST", "/api/imports", { accountId: account.body.id, fileName: "synthetic.csv", sha256: sha });
  check("the same file is refused the second time", again.status === 409, `HTTP ${again.status}`);
} finally {
  // Clean up every item the synthetic user owns.
  const env = JSON.parse(aws(["lambda", "get-function-configuration", "--function-name", fn])).Environment.Variables;
  const tables = ["TRANSACTIONS_TABLE", "INVESTMENT_TX_TABLE", "AGGREGATES_TABLE", "REFERENCE_TABLE", "INGESTION_TABLE"].map((k) => env[k]);
  let deleted = 0;
  for (const table of tables) {
    const items = JSON.parse(
      aws([
        "dynamodb", "query", "--table-name", table, "--key-condition-expression", "PK = :pk",
        "--expression-attribute-values", JSON.stringify({ ":pk": { S: `USER#${USER}` } }),
        "--projection-expression", "PK, SK",
      ]),
    ).Items;
    for (const key of items) {
      aws(["dynamodb", "delete-item", "--table-name", table, "--key", JSON.stringify(key)]);
      deleted++;
    }
  }
  console.log(`cleanup: deleted ${deleted} items of the synthetic user`);
  const bucket = env.RAW_BUCKET;
  const raw = JSON.parse(aws(["s3api", "list-objects-v2", "--bucket", bucket, "--prefix", `raw/${USER}/`])).Contents ?? [];
  for (const key of [...uploadedKeys, ...raw.map((o) => o.Key)]) aws(["s3api", "delete-object", "--bucket", bucket, "--key", key]);
  console.log(`cleanup: deleted ${uploadedKeys.length + raw.length} S3 objects`);
  rmSync(dir, { recursive: true, force: true });
}
console.log(failures === 0 ? "ALL PASSED" : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
