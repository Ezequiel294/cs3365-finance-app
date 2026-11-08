import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCsv } from "../src/ingest/csv";
import { CsvTemplateParser } from "../src/ingest/csv-template-parser";
import { EmailTemplateParser } from "../src/ingest/email-template-parser";
import { htmlToText, parseMime } from "../src/ingest/mime";
import { ParsedRowSchema } from "../src/ingest/parsed-row-schema";
import { TemplateRegistry } from "../src/ingest/template-registry";
import { exampleBankCsv } from "../src/ingest/templates/example-bank-csv";
import { exampleBankEmail } from "../src/ingest/templates/example-bank-email";
import type { CsvTemplate } from "../src/ingest/templates/types";
import { parseAmount, parseDate } from "../src/ingest/values";

const fixture = (name: string) => readFileSync(join(import.meta.dirname, "fixtures", name), "utf8");

describe("value parsing", () => {
  it("reads amounts in both number formats without floating point", () => {
    expect(parseAmount("14,000.00", "en")).toEqual({ minor: 1_400_000, negative: false });
    expect(parseAmount("14.000,50", "es")).toEqual({ minor: 1_400_050, negative: false });
    expect(parseAmount("-10.9", "en")).toEqual({ minor: 1090, negative: true });
    expect(parseAmount("(1,250.00)", "en")).toEqual({ minor: 125_000, negative: true });
    expect(parseAmount("₡ 3 500", "en")).toEqual({ minor: 350_000, negative: false });
    expect(parseAmount("1.2.3", "en")).toBeNull();
    expect(parseAmount("", "en")).toBeNull();
  });

  it("reads dates and rejects impossible ones", () => {
    expect(parseDate("14/10/2026", "dd/MM/yyyy")).toBe("2026-10-14");
    expect(parseDate("10/14/2026", "MM/dd/yyyy")).toBe("2026-10-14");
    expect(parseDate("2026-1-5", "yyyy-MM-dd")).toBe("2026-01-05");
    expect(parseDate("31/02/2026", "dd/MM/yyyy")).toBeNull();
  });
});

describe("TemplateRegistry", () => {
  const registry = new TemplateRegistry();
  it("detects the CSV template by its header row, ignoring case and accents", () => {
    expect(registry.detect(["fecha", "DESCRIPCION", "Referencia", "Debito", "Crédito", "Moneda"])?.id).toBe("example-bank-csv-v1");
    expect(registry.detect(["Date", "Amount"])).toBeUndefined();
  });
  it("matches emails by allowlisted sender and subject", () => {
    expect(registry.match("alertas@example-bank.test", "Notificación de transacción")?.id).toBe("example-bank-email-v1");
    expect(registry.match("someone@else.test", "Notificación de transacción")).toBeUndefined();
    expect(registry.senderAllowlist()).toEqual(["alertas@example-bank.test"]);
    expect(registry.allowedDomains()).toEqual(["example-bank.test"]);
  });
  it("marks the example templates as placeholders", () => {
    expect(exampleBankCsv.placeholder).toBe(true);
    expect(exampleBankEmail.placeholder).toBe(true);
  });
});

describe("CsvTemplateParser (golden test on the synthetic statement)", () => {
  const parser = new CsvTemplateParser();
  const schema = new ParsedRowSchema();
  const rows = parseCsv(fixture("example-bank-statement.csv"), ",");
  const account = { currency: "CRC" as const, last4: "1234" };

  it("parses a CRC debit, a USD debit, and a USD credit, each in its own currency (05-S06)", () => {
    expect(schema.validate(parser.parseRow(rows[3], exampleBankCsv, account))).toEqual({
      accountLast4: "1234",
      localDate: "2026-10-14",
      kind: "purchase",
      currency: "CRC",
      amountMinor: 1_400_000,
      merchantRaw: "AUTOMERCADO ESCAZU 042",
      statementRef: "000123",
      source: "csv",
    });
    expect(parser.parseRow(rows[4], exampleBankCsv, account)).toMatchObject({ currency: "USD", amountMinor: 1099, kind: "purchase" });
    expect(parser.parseRow(rows[5], exampleBankCsv, account)).toMatchObject({ currency: "USD", amountMinor: 125_000, kind: "income" });
  });

  it("reports unreadable rows with a reason", () => {
    expect(() => parser.parseRow(rows[6], exampleBankCsv, account)).toThrow("unknown currency");
    expect(() => parser.parseRow(rows[7], exampleBankCsv, account)).toThrow(/unreadable date/);
  });

  it("takes the account's currency when the template says so, and reads one signed amount column", () => {
    const template: CsvTemplate = {
      ...exampleBankCsv,
      id: "test-signed",
      headerRow: ["Date", "Details", "Amount"],
      dateFormat: "yyyy-MM-dd",
      columns: { date: "Date", description: "Details", amount: "Amount" },
      currencySource: "account",
      debitIsNegative: true,
    };
    expect(parser.parseRow(["2026-10-14", "Coffee", "-1,500.00"], template, account)).toMatchObject({ currency: "CRC", amountMinor: 150_000, kind: "purchase" });
    expect(parser.parseRow(["2026-10-14", "Refund", "200.00"], template, account)).toMatchObject({ kind: "income", amountMinor: 20_000 });
  });
});

describe("EmailTemplateParser (golden test on the synthetic alert)", () => {
  it("decodes the MIME message and extracts every field", () => {
    const mime = parseMime(fixture("example-bank-alert.eml"));
    expect(mime.subject).toBe("Notificación de transacción");
    expect(mime.fromAddress).toBe("alertas@example-bank.test");
    expect(mime.messageId).toBe("synthetic-0001@example-bank.test");
    const parsed = new ParsedRowSchema().validate(new EmailTemplateParser().parse(mime, exampleBankEmail));
    expect(parsed).toEqual({
      accountLast4: "1234",
      localDate: "2026-10-14",
      occurredAt: "2026-10-14T19:45:10.000Z",
      kind: "purchase",
      currency: "CRC",
      amountMinor: 1_400_000,
      merchantRaw: "AUTOMERCADO ESCAZU 042",
      statementRef: "123456",
      source: "gmail",
      sourceRef: "synthetic-0001@example-bank.test",
    });
  });

  it("falls back to the HTML part when there is no plain text", () => {
    const raw = [
      "From: alertas@example-bank.test",
      "Subject: Notificacion de transaccion",
      "Content-Type: text/html; charset=UTF-8",
      "",
      "<p>Tarjeta terminada en 9876</p><table><tr><td>Comercio:</td><td>UBER EATS</td></tr></table><p>Fecha: 01/11/2026</p><p>Monto: USD 12.50</p>",
    ].join("\r\n");
    const parsed = new EmailTemplateParser().parse(parseMime(raw), exampleBankEmail);
    expect(parsed).toMatchObject({ accountLast4: "9876", merchantRaw: "UBER EATS", currency: "USD", amountMinor: 1250, localDate: "2026-11-01" });
  });

  it("refuses an email without an amount", () => {
    const raw = "From: alertas@example-bank.test\r\nSubject: Notificacion de transaccion\r\n\r\nHola";
    expect(() => new EmailTemplateParser().parse(parseMime(raw), exampleBankEmail)).toThrow("no amount found in the email");
  });

  it("turns HTML into readable lines", () => {
    expect(htmlToText("<div>Monto:&nbsp;CRC 1</div><br>Comercio: A&amp;B")).toBe("Monto: CRC 1\nComercio: A&B");
  });
});
