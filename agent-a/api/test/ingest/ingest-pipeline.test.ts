/**
 * IngestPipeline end to end over the real samples, with the save path and storage faked at
 * their interfaces (no AWS).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImportJob, IngestMessage, Transaction } from '../../../shared/types';
import { Normalizer } from '../../src/categorization/normalizer';
import { FixedClock } from '../../src/clock';
import { AlreadyClaimedError, FxUnavailableError } from '../../src/http/errors';
import { CsvTemplateParser } from '../../src/ingest/csv-template-parser';
import { DkimVerifier } from '../../src/ingest/dkim-verifier';
import { EmailTemplateParser } from '../../src/ingest/email-template-parser';
import { IngestPipeline } from '../../src/ingest/ingest-pipeline';
import { KindResolver } from '../../src/ingest/kind-resolver';
import { TemplateRegistry } from '../../src/ingest/template-registry';
import { SAMPLE_ACCOUNTS } from '../sample-accounts';
import { USER, txn } from '../helpers';

const SAMPLES = join(__dirname, '..', '..', '..', 'samples');

function job(accountId: string): ImportJob {
  return {
    id: 'imp1',
    accountId,
    fileHash: 'f'.repeat(64),
    fileName: null,
    status: 'PROCESSING',
    failureReason: null,
    templateId: null,
    statementIban: null,
    statementDate: null,
    imported: 0,
    merged: 0,
    skipped: 0,
    transfers: 0,
    checksum: null,
    rowErrors: [],
    createdAt: '2026-11-01T00:00:00Z',
  };
}

function setup(opts: { file?: string; accountId?: string; dkim?: boolean; claimed?: Set<string>; existing?: Transaction[] } = {}) {
  const imports = new Map<string, ImportJob>([['imp1', job(opts.accountId ?? 'acc-bac-usd')]]);
  const fileStatus: string[] = [];
  const messages = new Map<string, IngestMessage>();
  const saved: Array<{ draft: any; categorization: any }> = [];
  const merged: Array<{ keepId: string; incoming: any }> = [];
  const claimed = opts.claimed ?? new Set<string>();
  const objects = new Map<string, Uint8Array>();
  if (opts.file) objects.set(`imports/${USER}/imp1.csv`, readFileSync(join(SAMPLES, opts.file)));
  objects.set('raw/bac.eml', readFileSync(join(SAMPLES, 'bac-card-alert.eml')));
  objects.set('raw/bn.eml', readFileSync(join(SAMPLES, 'bn-voucher-digital.eml')));

  const transactions = {
    save: vi.fn(async (_u: string, draft: any, categorization: any, extra: any[]) => {
      const fp = extra[0]?.Put?.Item?.SK;
      if (fp && claimed.has(fp)) throw new AlreadyClaimedError();
      if (fp) claimed.add(fp);
      saved.push({ draft, categorization });
      return txn({ ...draft, id: `t${saved.length}`, kind: categorization.kind ?? draft.kind });
    }),
    merge: vi.fn(async (_u: string, keepId: string, incoming: any) => {
      merged.push({ keepId, incoming });
      return txn({ id: keepId, kind: incoming.draft.kind });
    }),
  };
  const pipeline = new IngestPipeline({
    raw: { getObject: async (key: string) => objects.get(key)! },
    registry: new TemplateRegistry(),
    csvParser: new CsvTemplateParser(),
    emailParser: new EmailTemplateParser(),
    kindResolver: new KindResolver(),
    normalizer: new Normalizer(),
    categorizer: { categorize: async () => ({ categoryId: null, tagIds: [], kind: null, categorizedBy: 'none', status: 'pending_review' }) },
    fx: { toUsd: async (a: number, c: string, d: string) => ({ amountUsdCents: c === 'USD' ? a : Math.round(a / 500), fxRate: c === 'USD' ? 1 : 500, fxDate: d }) },
    duplicates: {
      findMatch: async (_u: string, parsed: any) => {
        const ex = (opts.existing ?? []).find((t) => t.amountMinor === parsed.amountMinor && t.accountId === parsed.accountId);
        return ex ? { type: 'exact', existing: ex } : { type: 'none', existing: null };
      },
    },
    transactions,
    ingestion: {
      getImport: async (_u: string, id: string) => imports.get(id) ?? null,
      updateImport: async (_u: string, j: ImportJob) => void imports.set(j.id, j),
      setFileStatus: async (_u: string, _h: string, s: string) => void fileStatus.push(s),
      rowClaimItem: (_u: string, fp: string) => ({ Put: { TableName: 'Ingestion', Item: { PK: 'x', SK: `ROWFP#${fp}` } } }),
      claimMessage: async (_u: string, m: IngestMessage) => {
        if (messages.has(m.messageId)) return false;
        messages.set(m.messageId, m);
        return true;
      },
      markRepeat: async () => undefined,
      updateMessage: async (_u: string, m: IngestMessage) => void messages.set(m.messageId, m),
      deleteMessage: async (_u: string, id: string) => void messages.delete(id),
      getMessage: async (_u: string, id: string) => messages.get(id) ?? null,
    },
    reference: {
      getAccount: async (_u: string, id: string) => SAMPLE_ACCOUNTS.find((a) => a.id === id) ?? null,
      listAccounts: async () => SAMPLE_ACCOUNTS,
      findAccountByCard: async (_u: string, last4: string) => SAMPLE_ACCOUNTS.find((a) => a.cardLast4s.includes(last4)) ?? null,
    },
    dkim: new DkimVerifier(async () => ({
      results: opts.dkim === false ? [] : [
        { signingDomain: 'amazonses.com', status: { result: 'pass' } },
        { signingDomain: 'baccredomatic.cr', status: { result: 'pass' } },
        { signingDomain: 'bncr.fi.cr', status: { result: 'pass' } },
      ],
    })),
    clock: new FixedClock(new Date('2026-11-11T12:00:00Z')),
  });
  return { pipeline, imports, fileStatus, messages, saved, merged, claimed, transactions };
}

describe('IngestPipeline.processCsv (01-S02, 05-S06)', () => {
  it('imports the BAC sample: 65 rows, 58 transfers, totals that match', async () => {
    const { pipeline, fileStatus, saved } = setup({ file: 'bac-statement-usd.csv' });
    const result = await pipeline.processCsv(USER, 'imp1');
    expect(result).toMatchObject({
      status: 'DONE',
      templateId: 'bac-transacciones-mes',
      statementIban: 'CR00010200001234567890',
      statementDate: '2026-10-31',
      imported: 65,
      transfers: 58,
      merged: 0,
      skipped: 0,
      rowErrors: [],
    });
    expect(result.checksum).toMatchObject({ ok: true, expectedOutMinor: 203243, actualOutMinor: 203243, expectedInMinor: 191367, actualInMinor: 191367 });
    expect(fileStatus).toEqual(['DONE']);
    expect(saved.every((s) => s.draft.currency === 'USD' && s.draft.sources[0] === 'csv')).toBe(true);
  });

  it('re-importing skips every row already claimed', async () => {
    const first = setup({ file: 'bac-statement-usd.csv' });
    await first.pipeline.processCsv(USER, 'imp1');
    const second = setup({ file: 'bac-statement-usd.csv', claimed: first.claimed });
    const result = await second.pipeline.processCsv(USER, 'imp1');
    expect(result).toMatchObject({ imported: 0, skipped: 65, status: 'DONE' });
  });

  it('imports the BN sample with the account currency', async () => {
    const { pipeline } = setup({ file: 'bn-statement-usd.csv', accountId: 'acc-bn-usd' });
    const result = await pipeline.processCsv(USER, 'imp1');
    expect(result).toMatchObject({ status: 'DONE', imported: 5, transfers: 0, templateId: 'bn-consulta-saldos' });
    expect(result.checksum?.ok).toBe(true);
  });

  it('merges a row that exactly matches an email', async () => {
    const existing = [txn({ id: 'e1', accountId: 'acc-bn-usd', amountMinor: 30465, sources: ['gmail'] })];
    const { pipeline, merged } = setup({ file: 'bn-statement-usd.csv', accountId: 'acc-bn-usd', existing });
    const result = await pipeline.processCsv(USER, 'imp1');
    expect(result).toMatchObject({ imported: 4, merged: 1 });
    expect(merged[0]!.keepId).toBe('e1');
  });

  it.each([
    ['acc-bn-usd', 'bac-statement-usd.csv', 'This is a BAC statement, but the account BN dólares is at Banco Nacional.'],
    ['acc-bac-crc', 'bac-statement-usd.csv', 'This statement is in USD, but the account BAC colones is in CRC.'],
    ['acc-bac-usd', 'bn-statement-usd.csv', 'This is a Banco Nacional statement, but the account BAC dólares is at BAC Credomatic.'],
    ['acc-bac-usd', 'README.md', 'This file is not a BAC or Banco Nacional statement export.'],
  ])('refuses the whole file (%s, %s)', async (accountId, file, reason) => {
    const { pipeline, fileStatus, saved } = setup({ file, accountId });
    const result = await pipeline.processCsv(USER, 'imp1');
    expect(result).toMatchObject({ status: 'FAILED', failureReason: reason });
    expect(fileStatus).toEqual(['FAILED']);
    expect(saved).toHaveLength(0);
  });

  it('a row without an exchange rate becomes a row error and is not claimed', async () => {
    const ctx = setup({ file: 'bn-statement-usd.csv', accountId: 'acc-bn-usd' });
    let n = 0;
    (ctx.pipeline as any).d.fx = { toUsd: async (a: number, _c: string, d: string) => { if (n++ === 0) throw new FxUnavailableError(d); return { amountUsdCents: a, fxRate: 1, fxDate: d }; } };
    const result = await ctx.pipeline.processCsv(USER, 'imp1');
    expect(result.imported).toBe(4);
    expect(result.rowErrors).toEqual([{ line: 2, reason: 'The exchange rate for 2026-10-20 is not available yet' }]);
    expect(ctx.claimed.size).toBe(4);
  });
});

describe('IngestPipeline.processEmail (01-S08b, 01-S08c)', () => {
  it('imports the BAC alert on the account holding card 1111', async () => {
    const { pipeline, messages, saved } = setup();
    const r = await pipeline.processEmail(USER, 'm1', 'raw/bac.eml');
    expect(r.status).toBe('imported');
    expect(saved[0]!.draft).toMatchObject({ accountId: 'acc-bac-crc', amountMinor: 200000, currency: 'CRC', merchantRaw: 'FM ESC AVENIDA ESCAZU', sources: ['gmail'] });
    expect(messages.get('m1')).toMatchObject({ status: 'imported', templateId: 'bac-notificacion', transactionId: 't1' });
  });

  it('the same message again is a duplicate', async () => {
    const { pipeline } = setup();
    await pipeline.processEmail(USER, 'm1', 'raw/bn.eml');
    expect((await pipeline.processEmail(USER, 'm1', 'raw/bn.eml')).status).toBe('duplicate');
  });

  it('rejects an email without a valid signature from the bank domain', async () => {
    const { pipeline, messages } = setup({ dkim: false });
    expect((await pipeline.processEmail(USER, 'm1', 'raw/bac.eml')).status).toBe('rejected');
    expect(messages.get('m1')).toMatchObject({ status: 'rejected', reason: 'DKIM_FAILED' });
  });

  it('a card on no account is unparsed with UNKNOWN_CARD, and Retry works once the card is added', async () => {
    const ctx = setup();
    const accounts = SAMPLE_ACCOUNTS.map((a) => ({ ...a, cardLast4s: a.cardLast4s.filter((c) => c !== '2222') }));
    (ctx.pipeline as any).d.reference = { ...(ctx.pipeline as any).d.reference, findAccountByCard: async (_u: string, l: string) => accounts.find((a) => a.cardLast4s.includes(l)) ?? null };
    const r = await ctx.pipeline.processEmail(USER, 'm2', 'raw/bn.eml');
    expect(r).toMatchObject({ status: 'unparsed', reason: 'UNKNOWN_CARD:2222' });
    // The user adds card 2222; ReviewService.retry deletes MSG# and processes the stored email again.
    (ctx.pipeline as any).d.reference.findAccountByCard = async (_u: string, l: string) => SAMPLE_ACCOUNTS.find((a) => a.cardLast4s.includes(l)) ?? null;
    ctx.messages.delete('m2');
    expect((await ctx.pipeline.processEmail(USER, 'm2', 'raw/bn.eml')).status).toBe('imported');
  });

  it('a failure releases the claim so the script delivers it again', async () => {
    const ctx = setup();
    (ctx.pipeline as any).d.fx = { toUsd: async (_a: number, _c: string, d: string) => { throw new FxUnavailableError(d); } };
    await expect(ctx.pipeline.processEmail(USER, 'm3', 'raw/bac.eml')).rejects.toBeInstanceOf(FxUnavailableError);
    expect(ctx.messages.has('m3')).toBe(false);
  });
});

beforeEach(() => vi.restoreAllMocks());
