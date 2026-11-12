import type { IngestResult } from '../../../shared/api-types';
import type {
  Account,
  Bank,
  ChecksumResult,
  ImportJob,
  IngestMessage,
  ParsedTransaction,
  RowError,
  Transaction,
} from '../../../shared/types';
import type { Categorization, Categorizer } from '../categorization/categorizer';
import type { Normalizer } from '../categorization/normalizer';
import type { Clock } from '../clock';
import type { TransactionDraft, TransactionService } from '../core/transaction-service';
import type { FxService } from '../fx/fx-service';
import { AlreadyClaimedError, FxUnavailableError, NotFoundError } from '../http/errors';
import { sha256Hex } from '../ids';
import type { TransactItem } from '../repositories/dynamo-store';
import type { IngestionRepository } from '../repositories/ingestion-repository';
import { RawObjectStore } from '../repositories/raw-object-store';
import type { ReferenceRepository } from '../repositories/reference-repository';
import { CsvReader } from './csv-reader';
import { type CsvTemplateParser, RowParseError, type StatementData } from './csv-template-parser';
import type { DkimVerifier } from './dkim-verifier';
import type { DuplicateMatcher } from './duplicate-matcher';
import { EmailParseError, type EmailTemplateParser } from './email-template-parser';
import type { KindResolver } from './kind-resolver';
import { ParsedRowSchema, ParsedRowValidationError } from './parsed-row-schema';
import type { TemplateRegistry } from './template-registry';
import type { CsvTemplate } from './templates/types';

const BANK_SHORT: Record<Bank, string> = { BAC: 'BAC', BN: 'Banco Nacional' };
const BANK_FULL: Record<Bank, string> = { BAC: 'BAC Credomatic', BN: 'Banco Nacional' };
const MESSAGE_TTL_DAYS = 90;

export interface IngestPipelineDeps {
  raw: Pick<RawObjectStore, 'getObject'>;
  registry: TemplateRegistry;
  csvParser: CsvTemplateParser;
  emailParser: EmailTemplateParser;
  kindResolver: KindResolver;
  normalizer: Normalizer;
  categorizer: Pick<Categorizer, 'categorize'>;
  fx: Pick<FxService, 'toUsd'>;
  duplicates: Pick<DuplicateMatcher, 'findMatch'>;
  transactions: Pick<TransactionService, 'save' | 'merge'>;
  ingestion: Pick<
    IngestionRepository,
    | 'getImport'
    | 'updateImport'
    | 'setFileStatus'
    | 'rowClaimItem'
    | 'claimMessage'
    | 'markRepeat'
    | 'updateMessage'
    | 'deleteMessage'
    | 'getMessage'
  >;
  reference: Pick<ReferenceRepository, 'getAccount' | 'listAccounts' | 'findAccountByCard'>;
  dkim: Pick<DkimVerifier, 'verify'>;
  clock: Clock;
}

interface IngestOutcome {
  transaction: Transaction;
  merged: boolean;
}

/** One pipeline for CSV statements and Gmail alerts; both end in TransactionService. */
export class IngestPipeline {
  constructor(private readonly d: IngestPipelineDeps) {}

  // ---------------------------------------------------------------- CSV statements

  async processCsv(userId: string, importId: string): Promise<ImportJob> {
    const job = await this.d.ingestion.getImport(userId, importId);
    if (!job) throw new NotFoundError('Import not found.');
    try {
      return await this.runCsv(userId, job);
    } catch (e) {
      console.error(JSON.stringify({ msg: 'import failed', importId, error: (e as Error).name }));
      const failed: ImportJob = {
        ...job,
        status: 'FAILED',
        failureReason: 'Something went wrong while reading the statement. Try again in a moment.',
      };
      await this.d.ingestion.updateImport(userId, failed);
      await this.d.ingestion.setFileStatus(userId, job.fileHash, 'FAILED');
      return failed;
    }
  }

  private async runCsv(userId: string, job: ImportJob): Promise<ImportJob> {
    const [account, accounts] = await Promise.all([
      this.d.reference.getAccount(userId, job.accountId),
      this.d.reference.listAccounts(userId),
    ]);
    if (!account) return this.failImport(userId, job, 'The account for this import no longer exists.');
    const bytes = await this.d.raw.getObject(RawObjectStore.csvKey(userId, job.id));
    const lines = CsvReader.decode(bytes);
    const template = this.d.registry.detect(lines);
    const data = template ? this.d.csvParser.extract(lines, template) : null;
    const reason = this.checkFile(template, account, data);
    if (reason || !template || !data) {
      return this.failImport(userId, job, reason ?? 'This file is not a BAC or Banco Nacional statement export.');
    }

    const ownIbans = accounts.map((a) => a.iban).filter((i): i is string => Boolean(i));
    const counts = { imported: 0, merged: 0, skipped: 0, transfers: 0 };
    const rowErrors: RowError[] = [];
    const actual = { outMinor: 0, inMinor: 0, outCount: 0, inCount: 0 };

    for (const row of data.rows) {
      let parsed: ParsedTransaction;
      try {
        parsed = ParsedRowSchema.validate(this.d.csvParser.parseRow(row, template, data.meta, account));
      } catch (e) {
        if (e instanceof RowParseError || e instanceof ParsedRowValidationError) {
          rowErrors.push({ line: row.line, reason: e.message });
          continue;
        }
        throw e;
      }
      if (parsed.direction === 'out') {
        actual.outMinor += parsed.amountMinor;
        actual.outCount++;
      } else {
        actual.inMinor += parsed.amountMinor;
        actual.inCount++;
      }
      parsed.kind = this.d.kindResolver.resolve(parsed, template.kindRules, ownIbans, data.meta.holderName);
      const claim = this.d.ingestion.rowClaimItem(
        userId,
        this.rowFingerprint(account.id, template.id, parsed),
        job.id,
      );
      try {
        const out = await this.ingest(userId, parsed, [claim]);
        if (out.merged) counts.merged++;
        else counts.imported++;
        if (out.transaction.kind === 'transfer') counts.transfers++;
      } catch (e) {
        if (e instanceof AlreadyClaimedError) counts.skipped++;
        else if (e instanceof FxUnavailableError) {
          rowErrors.push({ line: row.line, reason: `The exchange rate for ${e.date} is not available yet` });
        } else throw e;
      }
    }

    const checksum = this.compare(data, actual);
    const done: ImportJob = {
      ...job,
      status: 'DONE',
      failureReason: null,
      templateId: template.id,
      statementIban: data.meta.iban,
      statementDate: data.meta.statementDate,
      ...counts,
      checksum,
      rowErrors,
    };
    await this.d.ingestion.updateImport(userId, done);
    await this.d.ingestion.setFileStatus(userId, job.fileHash, 'DONE');
    return done;
  }

  private async failImport(userId: string, job: ImportJob, reason: string): Promise<ImportJob> {
    const failed: ImportJob = { ...job, status: 'FAILED', failureReason: reason };
    await this.d.ingestion.updateImport(userId, failed);
    await this.d.ingestion.setFileStatus(userId, job.fileHash, 'FAILED');
    return failed;
  }

  /** The reason the whole file is refused, or null when it is accepted. */
  checkFile(
    template: CsvTemplate | null,
    account: Pick<Account, 'bank' | 'currency' | 'name'>,
    data: StatementData | null,
  ): string | null {
    if (!template || !data) return 'This file is not a BAC or Banco Nacional statement export.';
    if (template.bank !== account.bank) {
      return `This is a ${BANK_SHORT[template.bank]} statement, but the account ${account.name} is at ${BANK_FULL[account.bank]}.`;
    }
    if (!data.headerOk) return `The statement's columns are not the expected ones for ${BANK_SHORT[template.bank]}.`;
    if (template.currencySource === 'preamble' && data.meta.currency && data.meta.currency !== account.currency) {
      return `This statement is in ${data.meta.currency}, but the account ${account.name} is in ${account.currency}.`;
    }
    return null;
  }

  private compare(
    data: StatementData,
    actual: { outMinor: number; inMinor: number; outCount: number; inCount: number },
  ): ChecksumResult | null {
    const printed = data.checksum;
    if (!printed) return null;
    const amountsOk = printed.outMinor === actual.outMinor && printed.inMinor === actual.inMinor;
    const countsOk =
      (printed.outCount === undefined || printed.outCount === actual.outCount) &&
      (printed.inCount === undefined || printed.inCount === actual.inCount);
    return {
      expectedOutMinor: printed.outMinor,
      expectedInMinor: printed.inMinor,
      actualOutMinor: actual.outMinor,
      actualInMinor: actual.inMinor,
      expectedOutCount: printed.outCount,
      expectedInCount: printed.inCount,
      actualOutCount: actual.outCount,
      actualInCount: actual.inCount,
      ok: amountsOk && countsOk,
    };
  }

  /** SHA-256 of accountId | templateId | localDate | statementRef | amountMinor | direction. */
  rowFingerprint(accountId: string, templateId: string, parsed: ParsedTransaction): string {
    return sha256Hex(
      [accountId, templateId, parsed.localDate, parsed.statementRef ?? '', parsed.amountMinor, parsed.direction].join('|'),
    );
  }

  // ---------------------------------------------------------------- Gmail alerts

  async processEmail(userId: string, messageId: string, rawRef: string): Promise<IngestResult> {
    const now = this.d.clock.now();
    const base: IngestMessage = {
      messageId,
      status: 'received',
      reason: null,
      templateId: null,
      transactionId: null,
      rawRef,
      receivedAt: now.toISOString(),
      ttl: Math.floor(now.getTime() / 1000) + MESSAGE_TTL_DAYS * 86400,
    };
    const claimed = await this.d.ingestion.claimMessage(userId, base);
    if (!claimed) {
      await this.d.ingestion.markRepeat(userId, messageId, now.toISOString());
      return { status: 'duplicate' };
    }
    try {
      const mime = Buffer.from(await this.d.raw.getObject(rawRef));
      const env = await this.d.emailParser.envelope(mime);
      const finish = async (status: 'rejected' | 'unparsed' | 'imported', extra: Partial<typeof base> = {}) => {
        await this.d.ingestion.updateMessage(userId, { ...base, ...extra, status });
        return { status, reason: extra.reason ?? null, transactionId: extra.transactionId ?? null } as IngestResult;
      };
      if (!this.d.registry.senderAllowlist().includes(env.sender.toLowerCase())) {
        return finish('rejected', { reason: 'SENDER_NOT_ALLOWED' });
      }
      const template = this.d.registry.match(env.sender, env.subject);
      if (!template) return finish('unparsed', { reason: 'NO_TEMPLATE' });
      if (!(await this.d.dkim.verify(mime, template.dkimDomain))) {
        return finish('rejected', { reason: 'DKIM_FAILED', templateId: template.id });
      }
      let parsed: ParsedTransaction;
      try {
        parsed = this.d.emailParser.parseHtml(env.html, template);
      } catch (e) {
        if (e instanceof EmailParseError) return finish('unparsed', { reason: e.reason, templateId: template.id });
        throw e;
      }
      const account = await this.d.reference.findAccountByCard(userId, parsed.cardLast4 ?? '');
      if (!account) {
        return finish('unparsed', { reason: `UNKNOWN_CARD:${parsed.cardLast4}`, templateId: template.id });
      }
      parsed = ParsedRowSchema.validate({ ...parsed, accountId: account.id, sourceRef: messageId });
      const out = await this.ingest(userId, parsed, []);
      return finish('imported', { templateId: template.id, transactionId: out.transaction.id });
    } catch (e) {
      // Release the claim so the script's next run delivers the email again.
      await this.d.ingestion.deleteMessage(userId, messageId).catch(() => undefined);
      throw e;
    }
  }

  // ---------------------------------------------------------------- shared tail

  /** normalize → categorize (a user rule may replace the kind) → toUsd → duplicates → save or merge. */
  private async ingest(userId: string, parsed: ParsedTransaction, extraItems: TransactItem[]): Promise<IngestOutcome> {
    const merchantKey = this.d.normalizer.normalize(parsed.merchantRaw);
    const auto = await this.d.categorizer.categorize(userId, merchantKey);
    const categorization: Categorization = auto;
    const kind = auto.kind ?? parsed.kind;
    const usd = await this.d.fx.toUsd(parsed.amountMinor, parsed.currency, parsed.localDate);
    const draft: TransactionDraft = {
      accountId: parsed.accountId!,
      localDate: parsed.localDate,
      occurredAt: parsed.occurredAt,
      kind,
      currency: parsed.currency,
      amountMinor: parsed.amountMinor,
      merchantRaw: parsed.merchantRaw,
      merchantKey,
      statementRef: parsed.statementRef,
      sources: [parsed.source],
      usd,
    };
    const match = await this.d.duplicates.findMatch(userId, parsed);
    if (match.type === 'exact' && match.existing) {
      const transaction = await this.d.transactions.merge(userId, match.existing.id, { draft, categorization }, extraItems);
      return { transaction, merged: true };
    }
    if (match.type === 'near' && match.existing) draft.possibleDuplicateOf = match.existing.id;
    const transaction = await this.d.transactions.save(userId, draft, categorization, extraItems);
    return { transaction, merged: false };
  }
}
