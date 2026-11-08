import { createHash } from "node:crypto";
import type { Account, ImportJob, IngestMessage, ParsedTransaction, RowError } from "@finance/shared";
import type { Categorizer } from "../categorization/categorizer";
import type { Normalizer } from "../categorization/normalizer";
import type { Clock } from "../clock";
import type { FxService } from "../fx/fx-service";
import { AppError, FxUnavailableError } from "../http/errors";
import type { IngestionRepository } from "../repositories/ingestion-repository";
import { RawObjectStore } from "../repositories/raw-object-store";
import type { ReferenceRepository } from "../repositories/reference-repository";
import type { ResolvedParsed, TransactionService } from "../transactions/transaction-service";
import { decodeText, parseCsv } from "./csv";
import type { CsvTemplateParser } from "./csv-template-parser";
import type { DkimVerifier } from "./dkim-verifier";
import type { DuplicateMatcher } from "./duplicate-matcher";
import type { EmailTemplateParser } from "./email-template-parser";
import { parseMime } from "./mime";
import type { ParsedRowSchema } from "./parsed-row-schema";
import type { TemplateRegistry } from "./template-registry";
import type { CsvTemplate } from "./templates/types";

export type IngestStatus = "imported" | "merged" | "duplicate" | "rejected" | "unparsed";

export interface IngestResult {
  status: IngestStatus;
  transactionId?: string;
}

const HEADER_SEARCH_LINES = 15;
const MAX_ROW_ERRORS = 500;

/**
 * One pipeline for CSV rows and Gmail alerts. Every source is claimed first (`FILE#`, `ROWFP#`,
 * `MSG#`), so a repeat delivery is skipped; then the template parses it, the row is validated,
 * matched against duplicates, categorized, and saved through `TransactionService`.
 */
export class IngestPipeline {
  constructor(
    private readonly registry: TemplateRegistry,
    private readonly csvParser: CsvTemplateParser,
    private readonly emailParser: EmailTemplateParser,
    private readonly rowSchema: ParsedRowSchema,
    private readonly normalizer: Normalizer,
    private readonly fx: FxService,
    private readonly duplicates: DuplicateMatcher,
    private readonly categorizer: Categorizer,
    private readonly transactions: TransactionService,
    private readonly ingestion: IngestionRepository,
    private readonly reference: ReferenceRepository,
    private readonly raw: RawObjectStore,
    private readonly dkim: DkimVerifier,
    private readonly clock: Clock,
  ) {}

  // ---------- CSV statements (01-S02, 05-S06) ----------

  async processCsv(userId: string, importId: string): Promise<ImportJob | undefined> {
    const job = await this.ingestion.getImport(userId, importId);
    if (!job || job.status === "DONE" || job.status === "FAILED") return job;
    const fail = async (reason: string): Promise<ImportJob> => {
      const failed: ImportJob = { ...job, status: "FAILED", failureReason: reason, updatedAt: this.clock.now().toISOString() };
      await this.ingestion.updateImport(userId, failed);
      await this.ingestion.setFileStatus(userId, job.fileHash, "FAILED");
      return failed;
    };

    const account = await this.reference.getAccount(userId, job.accountId);
    if (!account) return fail("the account for this import no longer exists");

    const bytes = await this.raw.getObject(RawObjectStore.csvKey(userId, importId));
    if (createHash("sha256").update(bytes).digest("hex") !== job.fileHash) {
      return fail("the uploaded file is not the file that was selected");
    }

    const detected = this.detectTemplate(decodeText(bytes, "utf-8"));
    if (!detected) return fail("no bank template matches this file");
    const { template, headerLine } = detected;
    const text = template.encoding === "utf-8" ? decodeText(bytes, "utf-8") : decodeText(bytes, template.encoding);
    const rows = parseCsv(text, template.delimiter);

    const counts = { imported: 0, merged: 0, skipped: 0 };
    const rowErrors: RowError[] = [];
    const seen = new Map<string, number>();
    let retryable = false;
    const addError = (row: number, reason: string) => {
      if (rowErrors.length < MAX_ROW_ERRORS) rowErrors.push({ row, reason });
    };

    for (let i = headerLine + 1; i < rows.length; i++) {
      const cells = rows[i];
      const rowNumber = i + 1; // 1-based line in the file, as the user sees it
      if (cells.every((c) => c.trim() === "")) continue;

      let parsed: ParsedTransaction;
      try {
        parsed = this.rowSchema.validate(this.csvParser.parseRow(cells, template, account));
      } catch (error) {
        addError(rowNumber, error instanceof AppError ? error.message : "unreadable row");
        continue;
      }
      if (parsed.currency !== "CRC" && parsed.currency !== "USD") {
        addError(rowNumber, "unknown currency");
        continue;
      }

      const contentKey = cells.map((c) => c.trim()).join("\u0001");
      const occurrence = seen.get(contentKey) ?? 0;
      seen.set(contentKey, occurrence + 1);
      const fingerprint = this.rowFingerprint(cells, occurrence, `${template.id}:${account.id}`);
      if (!(await this.ingestion.claimRow(userId, fingerprint, this.clock.now()))) {
        counts.skipped++;
        continue;
      }

      try {
        const result = await this.ingest(userId, { ...parsed, accountId: account.id, currency: parsed.currency }, "csv");
        if (result.status === "merged") counts.merged++;
        else counts.imported++;
      } catch (error) {
        await this.ingestion.releaseRow(userId, fingerprint);
        if (error instanceof FxUnavailableError) {
          retryable = true;
          addError(rowNumber, "exchange rate not available for this date; import the file again later to add this row");
        } else {
          addError(rowNumber, error instanceof AppError ? error.message : "the row could not be saved");
          if (!(error instanceof AppError)) console.error(JSON.stringify({ msg: "csv row save failed", importId, row: rowNumber, error: (error as Error)?.name }));
        }
      }
    }

    const done: ImportJob = {
      ...job,
      status: "DONE",
      templateId: template.id,
      ...counts,
      rowErrors,
      updatedAt: this.clock.now().toISOString(),
    };
    await this.ingestion.updateImport(userId, done);
    // A file with rows that failed only for lack of a rate may be imported again; ROWFP# skips the rest.
    await this.ingestion.setFileStatus(userId, job.fileHash, retryable ? "FAILED" : "DONE");
    return done;
  }

  private detectTemplate(text: string): { template: CsvTemplate; headerLine: number } | undefined {
    const lines = text.split(/\r\n|\n|\r/).slice(0, HEADER_SEARCH_LINES);
    for (let i = 0; i < lines.length; i++) {
      for (const delimiter of this.registry.delimiters()) {
        const cells = parseCsv(lines[i], delimiter)[0] ?? [];
        const template = this.registry.detect(cells);
        if (template && template.delimiter === delimiter) {
          // Map the physical line to the parsed-row index (quoted newlines are rare before the header).
          return { template, headerLine: i };
        }
      }
    }
    return undefined;
  }

  // ---------- Gmail alerts (01-S08b) ----------

  async processEmail(userId: string, rawRef: string): Promise<IngestResult> {
    const mimeText = new TextDecoder("utf-8").decode(await this.raw.getObject(rawRef));
    const mime = parseMime(mimeText);
    const messageId = mime.messageId ?? createHash("sha256").update(mimeText).digest("hex");
    const message: IngestMessage = {
      messageId: messageKey(messageId),
      status: "received",
      rawRef,
      subject: mime.subject.slice(0, 200),
      sender: mime.fromAddress,
      receivedAt: this.clock.now().toISOString(),
    };
    if (!(await this.ingestion.claimMessage(userId, message))) return { status: "duplicate" };

    try {
      const allowed = this.registry.senderAllowlist();
      if (!mime.fromAddress || !allowed.includes(mime.fromAddress) || !(await this.dkim.verify(mimeText, this.registry.allowedDomains()))) {
        await this.ingestion.updateMessage(userId, { ...message, status: "rejected", reason: "sender not allowed or DKIM check failed" });
        return { status: "rejected" };
      }
      const template = this.registry.match(mime.fromAddress, mime.subject);
      if (!template) {
        await this.ingestion.updateMessage(userId, { ...message, status: "unparsed", reason: "no bank template matches this email" });
        return { status: "unparsed" };
      }

      const settings = await this.reference.getSettings(userId);
      let parsed: ParsedTransaction;
      try {
        parsed = this.rowSchema.validate(this.emailParser.parse(mime, template, settings.timeZone));
      } catch (error) {
        const reason = error instanceof AppError ? error.message : "the email could not be read";
        await this.ingestion.updateMessage(userId, { ...message, status: "unparsed", templateId: template.id, reason });
        return { status: "unparsed" };
      }
      const account = await this.accountFor(userId, parsed.accountLast4);
      if (!account || !parsed.currency) {
        const reason = account ? "unknown currency" : "no account matches the card or account in this email";
        await this.ingestion.updateMessage(userId, { ...message, status: "unparsed", templateId: template.id, reason });
        return { status: "unparsed" };
      }

      const result = await this.ingest(userId, { ...parsed, accountId: account.id, currency: parsed.currency }, "gmail");
      await this.ingestion.updateMessage(userId, { ...message, status: "imported", templateId: template.id, transactionId: result.transactionId });
      return { status: result.status === "merged" ? "merged" : "imported", transactionId: result.transactionId };
    } catch (error) {
      // Release the claim so the script's retry (after a 5xx) is processed instead of skipped.
      await this.ingestion.releaseMessage(userId, message.messageId).catch(() => undefined);
      throw error;
    }
  }

  private async accountFor(userId: string, last4: string | undefined): Promise<Account | undefined> {
    if (!last4) return undefined;
    const accounts = await this.reference.listAccounts(userId);
    return accounts.find((a) => a.last4 === last4);
  }

  // ---------- Shared tail ----------

  private async ingest(userId: string, parsed: ResolvedParsed, source: "csv" | "gmail"): Promise<{ status: "imported" | "merged"; transactionId: string }> {
    const conversion = await this.fx.toUsd(parsed.amountMinor, parsed.currency, parsed.localDate);
    const merchantKey = parsed.merchantRaw ? this.normalizer.normalize(parsed.merchantRaw) : undefined;
    const categorization = await this.categorizer.categorize(userId, merchantKey);
    const match = await this.duplicates.findMatch(userId, { ...parsed, source });
    if (match.type === "exact" && match.existing) {
      const merged = await this.transactions.mergeParsed(userId, match.existing.id, parsed, categorization);
      return { status: "merged", transactionId: merged.id };
    }
    const saved = await this.transactions.save(userId, parsed, categorization, {
      conversion,
      possibleDuplicateOf: match.type === "near" ? match.existing?.id : undefined,
    });
    return { status: "imported", transactionId: saved.id };
  }

  /**
   * A row's identity: its template, account, cell contents, and how many identical rows came
   * before it in the same file. The same row in an overlapping statement gets the same fingerprint.
   */
  rowFingerprint(row: string[], index: number, scope = ""): string {
    return createHash("sha256")
      .update(JSON.stringify([scope, row.map((c) => c.trim()), index]))
      .digest("hex");
  }
}

/** Message-IDs go into a sort key; overly long ones are hashed. */
function messageKey(messageId: string): string {
  return messageId.length <= 200 && /^[\x21-\x7e]+$/.test(messageId) ? messageId : createHash("sha256").update(messageId).digest("hex");
}
