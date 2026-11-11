import type { Account, ImportJob, IngestMessage, Rule, Transaction } from '@finance/shared';
import { FixedClock } from '../src/clock';
import { AlreadyClaimedError, FxUnavailableError } from '../src/errors';
import { CsvReader } from '../src/ingest/csv-reader';
import { CsvTemplateParser } from '../src/ingest/csv-template-parser';
import { DkimVerifier } from '../src/ingest/dkim-verifier';
import { DuplicateMatcher } from '../src/ingest/duplicate-matcher';
import { EmailTemplateParser } from '../src/ingest/email-template-parser';
import { IngestPipeline } from '../src/ingest/ingest-pipeline';
import { KindResolver } from '../src/ingest/kind-resolver';
import { TemplateRegistry } from '../src/ingest/template-registry';
import type { TransactItem } from '../src/repositories/dynamo-store';
import { Categorizer, type Categorization } from '../src/services/categorizer';
import { Normalizer } from '../src/services/normalizer';
import { statusFor, type TransactionDraft } from '../src/services/transaction-service';
import { TEST_ACCOUNTS } from './helpers';

export class FakeIngestion {
  imports = new Map<string, ImportJob>();
  files = new Map<string, string>();
  messages = new Map<string, IngestMessage>();

  async getImport(_u: string, id: string) {
    return this.imports.get(id);
  }
  async updateImport(_u: string, job: ImportJob) {
    this.imports.set(job.id, job);
  }
  async setFileStatus(_u: string, sha: string, status: string) {
    this.files.set(sha, status);
  }
  rowClaimItem(_u: string, fingerprint: string, importId: string): TransactItem {
    return { Put: { TableName: 'Ingestion', Item: { SK: `ROWFP#${fingerprint}`, importId } } };
  }
  async claimMessage(_u: string, message: IngestMessage) {
    if (this.messages.has(message.messageId)) return false;
    this.messages.set(message.messageId, { ...message });
    return true;
  }
  async updateMessage(_u: string, message: IngestMessage) {
    this.messages.set(message.messageId, { ...message });
  }
  async deleteMessage(_u: string, id: string) {
    this.messages.delete(id);
  }
  async getMessage(_u: string, id: string) {
    return this.messages.get(id);
  }
  async listUnparsed() {
    return [...this.messages.values()].filter((m) => m.status === 'unparsed');
  }
}

export class FakeReference {
  accounts: Account[] = TEST_ACCOUNTS.map((a) => ({ ...a, cardLast4s: [...a.cardLast4s] }));
  rules = new Map<string, Rule>();

  async getAccount(_u: string, id: string) {
    return this.accounts.find((a) => a.id === id);
  }
  async listAccounts() {
    return this.accounts;
  }
  async findAccountByCard(_u: string, last4: string) {
    return this.accounts.find((a) => a.cardLast4s.includes(last4));
  }
  async getRule(scope: string, key: string) {
    return this.rules.get(`${scope}|${key}`);
  }
}

/** Saves into memory; a repeated row claim fails the save like the real `TransactWriteItems`. */
export class FakeTransactionService {
  transactions: Transaction[] = [];
  claims = new Set<string>();
  fxDown = false;
  private seq = 0;

  private claim(extra: TransactItem[]) {
    for (const item of extra) {
      const sk = (item.Put?.Item as { SK: string }).SK;
      if (this.claims.has(sk)) throw new AlreadyClaimedError();
    }
    for (const item of extra) this.claims.add((item.Put?.Item as { SK: string }).SK);
  }

  async save(userId: string, draft: TransactionDraft, cat: Categorization, extra: TransactItem[] = [], options: { possibleDuplicateOf?: string | null } = {}) {
    if (draft.currency === 'CRC' && this.fxDown) throw new FxUnavailableError();
    this.claim(extra);
    const kind = cat.kind ?? draft.kind;
    const txn: Transaction = {
      id: `${draft.localDate.replace(/-/g, '')}-${++this.seq}`,
      userId,
      accountId: draft.accountId,
      localDate: draft.localDate,
      occurredAt: draft.occurredAt ?? null,
      kind,
      status: statusFor(kind, cat.categoryId),
      currency: draft.currency,
      amountMinor: draft.amountMinor,
      amountUsdCents: draft.currency === 'USD' ? draft.amountMinor : Math.round(draft.amountMinor / 500),
      fxRate: draft.currency === 'USD' ? 1 : 500,
      fxDate: draft.localDate,
      categoryId: cat.categoryId,
      tagIds: cat.tagIds,
      categorizedBy: cat.categorizedBy,
      merchantRaw: draft.merchantRaw,
      merchantKey: draft.merchantKey ?? '',
      sources: [draft.source],
      statementRef: draft.statementRef ?? null,
      possibleDuplicateOf: options.possibleDuplicateOf ?? null,
      version: 1,
      createdAt: '',
      updatedAt: '',
    };
    this.transactions.push(txn);
    return txn;
  }

  async merge(_u: string, keepId: string, drop: TransactionDraft, extra: TransactItem[] = []) {
    this.claim(extra);
    const keep = this.transactions.find((t) => t.id === keepId)!;
    keep.sources = [...new Set([...keep.sources, drop.source])];
    keep.occurredAt = keep.occurredAt ?? drop.occurredAt ?? null;
    return keep;
  }
}

export class FakeTransactionRepository {
  constructor(private readonly service: FakeTransactionService) {}
  async findNear(_u: string, accountId: string, from: string, to: string) {
    return this.service.transactions.filter((t) => t.accountId === accountId && t.localDate >= from && t.localDate <= to);
  }
}

export class FakeRaw {
  objects = new Map<string, Uint8Array>();
  async getObject(key: string) {
    const o = this.objects.get(key);
    if (!o) throw new Error('NoSuchKey');
    return o;
  }
}

export function buildPipeline(options: { dkimPasses?: boolean } = {}) {
  const ingestion = new FakeIngestion();
  const reference = new FakeReference();
  const raw = new FakeRaw();
  const service = new FakeTransactionService();
  const dkim = new DkimVerifier(async () => ({
    results: options.dkimPasses === false ? [] : [{ signingDomain: 'baccredomatic.cr', status: { result: 'pass' } }, { signingDomain: 'bncr.fi.cr', status: { result: 'pass' } }],
  }));
  const pipeline = new IngestPipeline(
    ingestion as never,
    reference as never,
    raw as never,
    new CsvReader(),
    new TemplateRegistry(),
    new CsvTemplateParser(),
    new EmailTemplateParser(),
    new KindResolver(),
    new Normalizer(),
    new Categorizer(reference as never),
    new DuplicateMatcher(new FakeTransactionRepository(service) as never),
    service as never,
    dkim,
    new FixedClock(new Date('2026-11-10T18:00:00Z')),
  );
  return { pipeline, ingestion, reference, raw, service };
}

export function newJob(id: string, accountId: string, fileHash = `hash-${id}`): ImportJob {
  return {
    id,
    accountId,
    fileHash,
    status: 'PROCESSING',
    imported: 0,
    merged: 0,
    skipped: 0,
    transfers: 0,
    rowErrors: [],
    createdAt: '',
    updatedAt: '',
  };
}
