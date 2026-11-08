import type { APIGatewayProxyEventV2, Context } from "aws-lambda";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ApiHandler } from "../src/handlers/api-handler";
import { addAccount, createHarness, USER, type Harness } from "./support/harness";

function event(method: string, path: string, opts: { body?: unknown; query?: string; sub?: string | null; headers?: Record<string, string> } = {}): APIGatewayProxyEventV2 {
  const body = opts.body === undefined ? undefined : typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
  return {
    version: "2.0",
    routeKey: "$default",
    rawPath: path,
    rawQueryString: opts.query ?? "",
    headers: { host: "api.example.test", "content-type": "application/json", ...(opts.headers ?? {}) },
    body,
    isBase64Encoded: false,
    requestContext: {
      accountId: "123",
      apiId: "api",
      domainName: "api.example.test",
      domainPrefix: "api",
      http: { method, path, protocol: "HTTP/1.1", sourceIp: "127.0.0.1", userAgent: "test" },
      requestId: "r",
      routeKey: "$default",
      stage: "$default",
      time: "",
      timeEpoch: 0,
      ...(opts.sub === null ? {} : { authorizer: { jwt: { claims: { sub: opts.sub ?? USER }, scopes: [] } } }),
    },
  } as unknown as APIGatewayProxyEventV2;
}

describe("ApiHandler routing and error mapping", () => {
  let h: Harness;
  let api: ApiHandler;
  beforeEach(async () => {
    h = createHarness();
    await addAccount(h, { currency: "USD" });
    api = new ApiHandler(h.services);
  });
  afterEach(() => h.restore());

  const call = async (e: APIGatewayProxyEventV2) => {
    const res = await api.handler(e, {} as Context);
    return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : undefined };
  };

  it("creates and lists transactions", async () => {
    const created = await call(event("POST", "/api/transactions", { body: { accountId: "acc-main", amountMinor: 1200, localDate: "2026-10-14", merchantRaw: "Spotify" } }));
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ amountMinor: 1200, currency: "USD", categoryId: "subscriptions" });
    const listed = await call(event("GET", "/api/transactions", { query: "from=2026-10-01&to=2026-10-31" }));
    expect(listed.status).toBe(200);
    expect(listed.body.items).toHaveLength(1);
  });

  it("maps validation errors to 400 with {code, message}", async () => {
    const res = await call(event("POST", "/api/transactions", { body: { accountId: "acc-main", amountMinor: -5, localDate: "2026-10-14" } }));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ code: "VALIDATION_FAILED", message: expect.stringContaining("amountMinor") });
    expect((await call(event("POST", "/api/transactions", { body: "{not json" }))).status).toBe(400);
  });

  it("rejects a call without Cognito claims with 401", async () => {
    const res = await call(event("GET", "/api/connections", { sub: null }));
    expect(res).toEqual({ status: 401, body: { code: "UNAUTHORIZED", message: "Unauthorized" } });
  });

  it("returns 404 for unknown routes and missing items, and 503 when the rate is unavailable", async () => {
    expect((await call(event("GET", "/api/nothing-here"))).status).toBe(404);
    expect((await call(event("PATCH", "/api/transactions/20261014-abcdefghjkmn", { body: { categoryId: "groceries" } }))).status).toBe(404);
    h.fx.fallback = null;
    const res = await call(event("POST", "/api/transactions", { body: { accountId: "acc-main", currency: "CRC", amountMinor: 100, localDate: "2026-10-14" } }));
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("FX_UNAVAILABLE");
  });

  it("rejects /ingest/gmail with an invalid token with 401", async () => {
    const res = await call(event("POST", "/ingest/gmail", { sub: null, body: "From: x\r\n\r\nhi", headers: { authorization: "Bearer not-a-real-token-123456789" } }));
    expect(res.status).toBe(401);
    expect((await call(event("GET", "/ingest/gmail/config", { sub: null }))).status).toBe(401);
  });

  it("serves the spending, budget, and cash-flow views", async () => {
    await call(event("POST", "/api/transactions", { body: { accountId: "acc-main", amountMinor: 3400, localDate: "2026-10-03", categoryId: "eating-out" } }));
    await call(event("POST", "/api/transactions", { body: { accountId: "acc-main", amountMinor: 6600, localDate: "2026-10-04" } }));
    await call(event("POST", "/api/transactions", { body: { accountId: "acc-main", kind: "income", amountMinor: 90000, localDate: "2026-09-30" } }));
    const byCat = await call(event("GET", "/api/analytics/spending", { query: "period=month&month=2026-10&groupBy=category" }));
    expect(byCat.body.categories).toEqual([
      { categoryId: "uncategorized", name: "Uncategorized", expenseCents: 6600, share: 0.66 },
      { categoryId: "eating-out", name: "Eating out", expenseCents: 3400, share: 0.34 },
    ]);
    const totals = await call(event("GET", "/api/analytics/spending", { query: "period=month&from=2026-08&to=2026-10" }));
    expect(totals.body.months).toEqual([
      { month: "2026-08", incomeCents: 0, expenseCents: 0 },
      { month: "2026-09", incomeCents: 90000, expenseCents: 0 },
      { month: "2026-10", incomeCents: 0, expenseCents: 10000 },
    ]);
    const budget = await call(event("POST", "/api/budgets", { body: { name: "Eating out", categoryIds: ["eating-out"], period: "MONTHLY", limitCents: 2000 } }));
    expect(budget.status).toBe(201);
    const progress = await call(event("GET", "/api/analytics/budgets"));
    expect(progress.body.items[0]).toMatchObject({ spentCents: 3400, percent: 170, overByCents: 1400 });
  });

  it("files a correction as a rule for the next charge from the same merchant (02-S05)", async () => {
    const first = await call(event("POST", "/api/transactions", { body: { accountId: "acc-main", amountMinor: 999, localDate: "2026-10-05", merchantRaw: "NEW GYM 0042" } }));
    expect(first.body.status).toBe("pending_review");
    await call(event("PATCH", `/api/transactions/${first.body.id}`, { body: { categoryId: "health" } }));
    const rule = await call(event("PUT", "/api/rules/new-gym", { body: { categoryId: "health", tagIds: [] } }));
    expect(rule.status).toBe(200);
    const next = await call(event("POST", "/api/transactions", { body: { accountId: "acc-main", amountMinor: 999, localDate: "2026-11-05", merchantRaw: "NEW GYM 0043" } }));
    expect(next.body).toMatchObject({ categoryId: "health", categorizedBy: "rule", status: "confirmed" });
    const review = await call(event("GET", "/api/review"));
    expect(review.body.count).toBe(0);
  });
});
