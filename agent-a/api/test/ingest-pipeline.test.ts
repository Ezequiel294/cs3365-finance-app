import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ImportWorkerHandler } from "../src/handlers/import-worker-handler";
import { Keys } from "../src/keys";
import { RawObjectStore } from "../src/repositories/raw-object-store";
import { addAccount, createHarness, TABLES, USER, type Harness } from "./support/harness";

const fixtureBytes = (name: string) => readFileSync(join(import.meta.dirname, "fixtures", name));
const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

async function uploadAndProcess(h: Harness, bytes: Uint8Array) {
  const start = await h.services.importService().createImport(USER, "acc-main", sha256(bytes), "statement.csv");
  expect(start.upload.fields.key).toBe(`imports/${USER}/${start.importId}.csv`);
  expect(start.upload.url).toContain("financeapp-test-raw");
  h.s3Objects.set(RawObjectStore.csvKey(USER, start.importId), bytes);
  const worker = new ImportWorkerHandler(h.services);
  await worker.handler({ Records: [{ s3: { object: { key: encodeURIComponent(`imports/${USER}/${start.importId}.csv`) } } }] } as never);
  return h.services.importService().getImport(USER, start.importId);
}

describe("IngestPipeline: CSV statements (01-S02, 05-S06)", () => {
  let h: Harness;
  beforeEach(async () => {
    h = createHarness();
    await addAccount(h, { currency: "CRC", last4: "1234" });
    h.fx.rates["2026-10-14"] = 510.95;
  });
  afterEach(() => h.restore());

  it("imports each readable row in its own currency and reports the unreadable ones", async () => {
    const job = await uploadAndProcess(h, fixtureBytes("example-bank-statement.csv"));
    expect(job).toMatchObject({ status: "DONE", templateId: "example-bank-csv-v1", imported: 5, merged: 0, skipped: 0 });
    expect(job.rowErrors).toEqual([
      { row: 7, reason: "unknown currency" },
      { row: 8, reason: expect.stringMatching(/unreadable date/) },
    ]);
    const txns = h.dynamo.items(TABLES.TRANSACTIONS_TABLE);
    const automercado = txns.find((t) => t.merchantRaw === "AUTOMERCADO ESCAZU 042")!;
    expect(automercado).toMatchObject({ currency: "CRC", amountMinor: 1_400_000, amountUsdCents: 2740, categoryId: "groceries", sources: ["csv"] });
    expect(txns.find((t) => t.merchantRaw === "SPOTIFY P1A2B3C4D5")).toMatchObject({ currency: "USD", amountMinor: 1099, amountUsdCents: 1099 });
    expect(txns.find((t) => t.kind === "income")).toMatchObject({ currency: "USD", amountMinor: 125_000 });
    // The two identical coffee rows are two purchases.
    expect(txns.filter((t) => t.merchantRaw === "CAFE LA OFICINA")).toHaveLength(2);
  });

  it("refuses the same file twice and skips overlapping rows from another file", async () => {
    const bytes = fixtureBytes("example-bank-statement.csv");
    await uploadAndProcess(h, bytes);
    await expect(h.services.importService().createImport(USER, "acc-main", sha256(bytes), "again.csv")).rejects.toMatchObject({ status: 409 });

    const overlapping = Buffer.from(bytes.toString("utf8") + "18/10/2026,NUEVA COMPRA,000129,\"3,000.00\",,CRC\n");
    const job = await uploadAndProcess(h, overlapping);
    expect(job).toMatchObject({ imported: 1, skipped: 5 });
  });

  it("fails the import when no bank template matches", async () => {
    const job = await uploadAndProcess(h, Buffer.from("Date,Amount\n2026-10-14,12.00\n"));
    expect(job).toMatchObject({ status: "FAILED", failureReason: "no bank template matches this file" });
  });

  it("fails the import when the uploaded file is not the one that was selected", async () => {
    const start = await h.services.importService().createImport(USER, "acc-main", "a".repeat(64), "x.csv");
    h.s3Objects.set(RawObjectStore.csvKey(USER, start.importId), Buffer.from("something else"));
    await new ImportWorkerHandler(h.services).handler({ Records: [{ s3: { object: { key: `imports/${USER}/${start.importId}.csv` } } }] } as never);
    expect(await h.services.importService().getImport(USER, start.importId)).toMatchObject({ status: "FAILED" });
  });

  it("keeps rows that lack an exchange rate out, so a later re-run can add them", async () => {
    h.fx.fallback = null;
    delete h.fx.rates["2026-10-14"];
    const bytes = fixtureBytes("example-bank-statement.csv");
    const job = await uploadAndProcess(h, bytes);
    expect(job.imported).toBe(2); // the USD rows
    expect(job.rowErrors.filter((e) => e.reason.startsWith("exchange rate not available"))).toHaveLength(3);
    h.fx.fallback = 500;
    const retry = await uploadAndProcess(h, bytes);
    expect(retry).toMatchObject({ imported: 3, skipped: 2 });
  });
});

describe("IngestPipeline: Gmail alerts and duplicates (01-S08b, 01-S04)", () => {
  let h: Harness;
  beforeEach(async () => {
    h = createHarness();
    await addAccount(h, { currency: "CRC", last4: "1234" });
    h.fx.rates["2026-10-14"] = 510.95;
  });
  afterEach(() => h.restore());

  const email = fixtureBytes("example-bank-alert.eml").toString("utf8");
  async function deliver(mime: string) {
    const rawRef = await h.services.rawObjectStore().putRawEmail(USER, "id", mime);
    return h.services.ingestPipeline().processEmail(USER, rawRef);
  }

  it("imports a verified alert once and skips a repeat delivery", async () => {
    const first = await deliver(email);
    expect(first.status).toBe("imported");
    const txn = h.dynamo.items(TABLES.TRANSACTIONS_TABLE)[0];
    expect(txn).toMatchObject({ amountMinor: 1_400_000, currency: "CRC", sources: ["gmail"], categoryId: "groceries", accountId: "acc-main" });
    expect(h.dynamo.item(TABLES.INGESTION_TABLE, Keys.user(USER), Keys.message("synthetic-0001@example-bank.test"))).toMatchObject({
      status: "imported",
      transactionId: txn.id,
    });
    expect((await deliver(email)).status).toBe("duplicate");
    expect(h.dynamo.items(TABLES.TRANSACTIONS_TABLE)).toHaveLength(1);
  });

  it("rejects mail that fails DKIM", async () => {
    h.dkimResult.value = false;
    expect((await deliver(email)).status).toBe("rejected");
    expect(h.dynamo.items(TABLES.TRANSACTIONS_TABLE)).toHaveLength(0);
  });

  it("shows emails no template can read in the review inbox", async () => {
    const unknown = email.replace("Subject: =?UTF-8?Q?Notificaci=C3=B3n_de_transacci=C3=B3n?=", "Subject: Estado de cuenta").replace("synthetic-0001", "synthetic-0002");
    expect((await deliver(unknown)).status).toBe("unparsed");
    const review = await h.services.reviewService().list(USER);
    expect(review.unparsed).toHaveLength(1);
    expect(review.count).toBe(1);
  });

  it("merges an email into the statement row of the same purchase automatically", async () => {
    await uploadAndProcess(h, fixtureBytes("example-bank-statement.csv"));
    const result = await deliver(email);
    expect(result.status).toBe("merged");
    const matches = h.dynamo.items(TABLES.TRANSACTIONS_TABLE).filter((t) => t.amountMinor === 1_400_000);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ sources: ["csv", "gmail"], statementRef: "000123", occurredAt: "2026-10-14T19:45:10.000Z" });
    expect(h.dynamo.item(TABLES.AGGREGATES_TABLE, Keys.user(USER), "DAY#2026-10-14#TOTAL")).toMatchObject({ count: 2 }); // automercado + spotify
  });

  it("flags a near match for review, and merging or dismissing clears it", async () => {
    await h.services.transactionService().create(USER, { accountId: "acc-main", kind: "purchase", amountMinor: 1_390_000, localDate: "2026-10-14", tagIds: [] });
    expect((await deliver(email)).status).toBe("imported");
    const pairs = await h.services.reviewService().listDuplicates(USER);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].other?.amountMinor).toBe(1_390_000);

    await h.services.reviewService().dismiss(USER, pairs[0].transaction.id);
    expect(await h.services.reviewService().listDuplicates(USER)).toHaveLength(0);
  });

  it("frees the message claim when saving fails, so the script's retry is processed", async () => {
    h.fx.fallback = null;
    delete h.fx.rates["2026-10-14"];
    await expect(deliver(email)).rejects.toMatchObject({ status: 503 });
    h.fx.fallback = 500;
    expect((await deliver(email)).status).toBe("imported");
  });
});
