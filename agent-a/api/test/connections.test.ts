import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GMAIL_SCRIPT_TEMPLATE } from "../src/connections/gmail-script.generated";
import { isStale } from "../src/connections/connection-service";
import { Keys } from "../src/keys";
import { createHarness, TABLES, USER, type Harness } from "./support/harness";

describe("ConnectionService (01-S08a, 01-S09, 06-S02)", () => {
  let h: Harness;
  beforeEach(() => (h = createHarness({ now: "2026-10-20T15:00:00Z" })));
  afterEach(() => h.restore());

  it("issues a token once and stores only its SHA-256", async () => {
    const setup = await h.services.connectionService().createGmail(USER);
    expect(setup.token.length).toBeGreaterThanOrEqual(43);
    const hash = createHash("sha256").update(setup.token).digest("hex");
    expect(h.dynamo.item(TABLES.INGESTION_TABLE, Keys.token(hash), Keys.ITEM)).toMatchObject({ userId: USER, connectionId: setup.connectionId });
    const stored = JSON.stringify(h.dynamo.items(TABLES.INGESTION_TABLE));
    expect(stored).not.toContain(setup.token);
    expect(setup.script).toContain("var API_BASE = 'https://api.example.test';");
    expect(setup.script).not.toContain(setup.token);
  });

  it("activates the connection on the config call and returns the sender allowlist", async () => {
    const svc = h.services.connectionService();
    const setup = await svc.createGmail(USER);
    await expect(svc.config("not-a-valid-token-at-all-xxxxxxxx")).rejects.toMatchObject({ status: 401 });
    expect(await svc.config(setup.token)).toEqual({ senders: ["alertas@example-bank.test"], label: "financeapp-processed" });
    const [conn] = await svc.list(USER);
    expect(conn).toMatchObject({ status: "ACTIVE", lastSeenAt: "2026-10-20T15:00:00.000Z", stale: false });
    expect(conn).not.toHaveProperty("tokenHash");
  });

  it("marks a connection stale after 24 hours without a heartbeat", async () => {
    const svc = h.services.connectionService();
    const setup = await svc.createGmail(USER);
    await svc.heartbeat(setup.token);
    h.clock.set(new Date("2026-10-21T16:00:00Z"));
    expect((await svc.list(USER))[0].stale).toBe(true);
    await svc.heartbeat(setup.token);
    expect((await svc.list(USER))[0].stale).toBe(false);
    expect(isStale({ status: "PENDING" }, new Date())).toBe(false);
  });

  it("revokes immediately: the old token gets 401 on the next call", async () => {
    const svc = h.services.connectionService();
    const setup = await svc.createGmail(USER);
    await svc.config(setup.token);
    await svc.revoke(USER, setup.connectionId);
    await expect(svc.authenticate(setup.token)).rejects.toMatchObject({ status: 401 });
    expect((await svc.list(USER))[0].status).toBe("REVOKED");
    await svc.heartbeat(setup.token).catch(() => undefined);
    expect((await svc.list(USER))[0].status).toBe("REVOKED");
  });

  it("rotates: the old token stops working and the new one works", async () => {
    const svc = h.services.connectionService();
    const first = await svc.createGmail(USER);
    const second = await svc.rotate(USER, first.connectionId);
    expect(second.connectionId).toBe(first.connectionId);
    await expect(svc.authenticate(first.token)).rejects.toMatchObject({ status: 401 });
    await expect(svc.authenticate(second.token)).resolves.toMatchObject({ userId: USER });
    expect((await svc.list(USER))[0].status).toBe("PENDING");
  });
});

describe("Gmail Apps Script", () => {
  it("is embedded in the API bundle exactly as written in gmail-script/Code.gs", () => {
    const source = readFileSync(join(import.meta.dirname, "..", "..", "gmail-script", "Code.gs"), "utf8");
    expect(GMAIL_SCRIPT_TEMPLATE).toBe(source);
  });

  it("reads the token from Script properties and never contains one", () => {
    expect(GMAIL_SCRIPT_TEMPLATE).toContain("getProperty('INGEST_TOKEN')");
    expect(GMAIL_SCRIPT_TEMPLATE).toContain("/ingest/gmail/heartbeat");
    expect(GMAIL_SCRIPT_TEMPLATE).toContain("everyMinutes(5)");
  });
});
