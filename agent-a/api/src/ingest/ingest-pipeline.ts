import { createHash } from 'node:crypto';
import type { Account, ChecksumResult, ImportJob, IngestMessage, IngestResult, RowError, Transaction } from '@finance/shared';
import type { Clock } from '../clock';
import { AlreadyClaimedError, FxUnavailableError, NotFoundError } from '../errors';
import type { TransactItem } from '../repositories/dynamo-store';
import type { IngestionRepository } from '../repositories/ingestion-repository';
import { RawObjectStore } from '../repositories/raw-object-store';
import type { ReferenceRepository } from '../repositories/reference-repository';
import type { Categorizer } from '../services/categorizer';
import type { Normalizer } from '../services/normalizer';
import type { TransactionService } from '../services/transaction-service';
import type { CsvReader } from './csv-reader';
import type { CsvTemplateParser, StatementData } from './csv-template-parser';
import type { DkimVerifier } from './dkim-verifier';
import type { DuplicateMatcher } from './duplicate-matcher';
import { EmailParseError, EmailTemplateParser } from './email-template-parser';
import type { KindResolver } from './kind-resolver';
import { ParsedRowSchema, RowParseError, type ParsedTransaction } from './parsed-transaction';
import type { TemplateRegistry } from './template-registry';
import type { CsvTemplate } from './templates';

/** Raw emails and their `MSG#` items are kept this long, so an email can be retried. */
export const MESSAGE_RETENTION_DAYS = 180;

const BANK_NAME = { BAC: 'BAC', BN: 'Banco Nacional' } as const;

type IngestOutcome = { outcome: 'imported' | 'merged'; transaction: Transaction };

/**
 * The shared ingestion pipeline for CSV statements (ImportWorkerFn) and Gmail
 * alerts (ApiFn). Every source is claimed (`FILE#`, `ROWFP#`, `MSG#`), so a
 * repeat delivery is skipped, and every transaction ends in `TransactionService`.
 */
export class IngestPipeline {
  constructor(
    private readonly ingestion: IngestionRepository,
    private readonly reference: ReferenceRepository,
    private readonly raw: RawObjectStore,
    private readonly reader: CsvReader,
    private readonly registry: TemplateRegistry,
    private readonly csvParser: CsvTemplateParser,
    private readonly emailParser: EmailTemplateParser,
    private readonly kinds: KindResolver,
    private readonly normalizer: Normalizer,
    private readonly categorizer: Categorizer,
    private readonly duplicates: DuplicateMatcher,
    private readonly transactions: TransactionService,
    private readonly dkim: DkimVerifier,
    private readonly clock: Clock,
  ) {}

  // ---------------------------------------------------------------- CSV

  async processCsv(userId: string, importId: string): Promise<ImportJob> {
    const job = await this.ingestion.getImport(userId, importId);
    if (!job) throw new NotFoundError('Import not found');
    const [account, accounts] = await Promise.all([
      this.reference.getAccount(userId, job.accountId),
      this.reference.listAccounts(userId),
    ]);
    const bytes = await this.raw.getObject(RawObjectStore.csvKey(userId, importId));
    const lines = this.reader.decode(bytes);
    const template = this.registry.detect(lines);
    const data = template ? this.csvParser.extract(lines, template) : null;

    const failure = this.checkFile(template, account, data);
    if (failure || !template || !data || !account) {
      return this.finishImport(userId, {
        ...job,
        status: 'FAILED',
        failureReason: failure ?? 'The account for this import no longer exists.',
        templateId: template?.id ?? null,
      });
    }

    const ownIbans = accounts.map((a) => a.iban).filter((i): i is string => !!i);
    const rowErrors: RowError[] = [];
    let imported = 0;
    let merged = 0;
    let skipped = 0;
    let transfers = 0;
    let outMinor = 0;
    let inMinor = 0;
    let outCount = 0;
    let inCount = 0;
    let retryable = false;

    for (const row of data.rows) {
      let parsed: ParsedTransaction;
      try {
        parsed = ParsedRowSchema.validate(this.csvParser.parseRow(row, template, data.meta, account));
        parsed.kind = this.kinds.resolve(parsed, template.kindRules, ownIbans, data.meta.holderName);
      } catch (err) {
        rowErrors.push({ line: row.line, reason: err instanceof RowParseError ? err.reason : 'Unreadable row' });
        continue;
      }
      if (parsed.direction === 'out') {
        outMinor += parsed.amountMinor;
        outCount += 1;
      } else {
        inMinor += parsed.amountMinor;
        inCount += 1;
      }
      const claim = this.ingestion.rowClaimItem(userId, this.rowFingerprint(account.id, template.id, parsed), importId);
      try {
        const result = await this.ingest(userId, parsed, [claim]);
        if (result.outcome === 'merged') merged += 1;
        else imported += 1;
        if (result.transaction.kind === 'transfer' && result.outcome === 'imported') transfers += 1;
      } catch (err) {
        if (err instanceof AlreadyClaimedError) {
          skipped += 1;
        } else if (err instanceof FxUnavailableError) {
          retryable = true;
          rowErrors.push({ line: row.line, reason: `No exchange rate for ${parsed.localDate} yet; upload the file again later` });
        } else {
          console.error(JSON.stringify({ msg: 'Row save failed', importId, line: row.line, error: (err as Error).name }));
          retryable = true;
          rowErrors.push({ line: row.line, reason: 'Could not save this row; upload the file again to retry' });
        }
      }
    }

    let checksum: ChecksumResult | null = null;
    if (data.checksum) {
      const countsOk =
        (data.checksum.outCount === undefined || data.checksum.outCount === outCount) &&
        (data.checksum.inCount === undefined || data.checksum.inCount === inCount);
      checksum = {
        expectedOutMinor: data.checksum.outMinor,
        expectedInMinor: data.checksum.inMinor,
        actualOutMinor: outMinor,
        actualInMinor: inMinor,
        expectedOutCount: data.checksum.outCount ?? null,
        expectedInCount: data.checksum.inCount ?? null,
        actualOutCount: outCount,
        actualInCount: inCount,
        ok: countsOk && data.checksum.outMinor === outMinor && data.checksum.inMinor === inMinor,
      };
    }

    return this.finishImport(
      userId,
      {
        ...job,
        status: 'DONE',
        failureReason: null,
        templateId: template.id,
        statementIban: data.meta.iban ?? null,
        statementDate: data.meta.statementDate ?? null,
        imported,
        merged,
        skipped,
        transfers,
        checksum,
        rowErrors,
      },
      // Rows that failed for a reason that can pass later are not claimed; the
      // file stays reclaimable so it can be uploaded again.
      retryable ? 'FAILED' : 'DONE',
    );
  }

  private async finishImport(userId: string, job: ImportJob, fileStatus?: string): Promise<ImportJob> {
    const done: ImportJob = { ...job, updatedAt: this.clock.now().toISOString() };
    await this.ingestion.updateImport(userId, done);
    await this.ingestion.setFileStatus(userId, job.fileHash, fileStatus ?? job.status);
    return done;
  }

  /** The reason a whole file is refused, or null when it is accepted (bank-formats.md section 5). */
  private checkFile(template: CsvTemplate | null, account: Account | undefined, meta: StatementData | null): string | null {
    if (!template || !meta) return 'This file is not a BAC or Banco Nacional statement export.';
    if (!account) return 'The account for this import no longer exists.';
    if (template.bank !== account.bank) {
      return `This is a ${BANK_NAME[template.bank]} statement, but the account ${account.name} is at ${BANK_NAME[account.bank]}.`;
    }
    if (!meta.headerOk) return `The statement's columns are not the expected ones for ${BANK_NAME[template.bank]}.`;
    if (template.currencySource === 'preamble') {
      const currency = meta.meta.currency;
      if (currency && currency !== account.currency) {
        return `This statement is in ${currency}, but the account ${account.name} is in ${account.currency}.`;
      }
    }
    return null;
  }

  /** SHA-256 of `accountId | templateId | localDate | statementRef | amountMinor | direction`. */
  private rowFingerprint(accountId: string, templateId: string, parsed: ParsedTransaction): string {
    const parts = [accountId, templateId, parsed.localDate, parsed.statementRef ?? '', parsed.amountMinor, parsed.direction];
    return createHash('sha256').update(parts.join('|')).digest('hex');
  }

  // ---------------------------------------------------------------- Email

  /** Processes one stored alert email. `mime` may be passed when it is already in memory. */
  async processEmail(userId: string, messageId: string, rawRef: string, mime?: Uint8Array): Promise<IngestResult> {
    const now = this.clock.now();
    const message: IngestMessage = {
      messageId,
      status: 'processing',
      rawRef,
      receivedAt: now.toISOString(),
      ttl: Math.floor(now.getTime() / 1000) + MESSAGE_RETENTION_DAYS * 86400,
    };
    if (!(await this.ingestion.claimMessage(userId, message))) {
      return { status: 'duplicate', reason: 'ALREADY_PROCESSED' };
    }
    const finish = async (status: IngestMessage['status'], extra: Partial<IngestMessage> = {}): Promise<IngestResult> => {
      Object.assign(message, { status, ...extra });
      await this.ingestion.updateMessage(userId, message);
      return { status, reason: message.reason ?? null, transactionId: message.transactionId ?? null };
    };

    try {
      const bytes = mime ?? (await this.raw.getObject(rawRef));
      const { mail, headers } = await EmailTemplateParser.readMail(bytes);
      message.subject = headers.subject.slice(0, 200);
      if (!this.registry.isAllowedSender(headers.from)) return await finish('rejected', { reason: 'SENDER_NOT_ALLOWED' });
      const template = this.registry.match(headers.from, headers.subject);
      if (!template) return await finish('unparsed', { reason: 'NO_TEMPLATE' });
      message.templateId = template.id;
      if (!(await this.dkim.verify(bytes, template.dkimDomain))) return await finish('rejected', { reason: 'DKIM_FAILED' });

      let email;
      try {
        email = await this.emailParser.parse(mail, template);
      } catch (err) {
        if (err instanceof EmailParseError) return await finish('unparsed', { reason: err.reason });
        throw err;
      }
      const account = await this.reference.findAccountByCard(userId, email.cardLast4);
      if (!account) return await finish('unparsed', { reason: `UNKNOWN_CARD:${email.cardLast4}` });

      let parsed: ParsedTransaction;
      try {
        parsed = ParsedRowSchema.validate({ ...email, accountId: account.id, sourceRef: messageId });
      } catch (err) {
        if (err instanceof RowParseError) return await finish('unparsed', { reason: `INVALID:${err.reason}` });
        throw err;
      }
      const result = await this.ingest(userId, parsed, []);
      return await finish(result.outcome === 'merged' ? 'duplicate' : 'imported', { transactionId: result.transaction.id, reason: null });
    } catch (err) {
      // Not understood is stored; a failure (e.g. no exchange rate) releases the claim so the script retries.
      await this.ingestion.deleteMessage(userId, messageId).catch(() => undefined);
      throw err;
    }
  }

  // ---------------------------------------------------------------- Shared

  /** Normalize, categorize (a user rule may replace the kind), match duplicates, then save or merge. */
  private async ingest(userId: string, parsed: ParsedTransaction, extraItems: TransactItem[]): Promise<IngestOutcome> {
    const merchantKey = this.normalizer.normalize(parsed.merchantRaw);
    const categorization = await this.categorizer.categorize(userId, merchantKey);
    const draft = {
      accountId: parsed.accountId,
      localDate: parsed.localDate,
      occurredAt: parsed.occurredAt,
      kind: categorization.kind ?? parsed.kind,
      currency: parsed.currency,
      amountMinor: parsed.amountMinor,
      merchantRaw: parsed.merchantRaw,
      merchantKey,
      statementRef: parsed.statementRef ?? null,
      authorization: parsed.authorization ?? null,
      source: parsed.source,
    };
    const match = await this.duplicates.findMatch(userId, draft);
    if (match.type === 'exact' && match.existing) {
      const transaction = await this.transactions.merge(userId, match.existing.id, { ...draft, categorization }, extraItems);
      return { outcome: 'merged', transaction };
    }
    const transaction = await this.transactions.save(userId, draft, categorization, extraItems, {
      possibleDuplicateOf: match.type === 'near' ? match.existing?.id ?? null : null,
    });
    return { outcome: 'imported', transaction };
  }
}
