import { describe, expect, it } from 'vitest';
import { RawObjectStore } from '../../src/repositories/raw-object-store';
import { buildPipeline, newJob } from '../fakes';
import { sample } from '../helpers';

const USER = 'user-1';

function withCsv(file: string | Buffer, accountId: string, importId = 'imp-1') {
  const ctx = buildPipeline();
  ctx.ingestion.imports.set(importId, newJob(importId, accountId));
  ctx.raw.objects.set(RawObjectStore.csvKey(USER, importId), typeof file === 'string' ? sample(file) : file);
  return ctx;
}

describe('IngestPipeline.processCsv', () => {
  it('imports the BAC sample into BAC dólares with matching totals', async () => {
    const { pipeline, service, ingestion } = withCsv('bac-statement-usd.csv', 'acc-bac-usd');
    const job = await pipeline.processCsv(USER, 'imp-1');
    expect(job.status).toBe('DONE');
    expect(job.templateId).toBe('bac-transacciones-mes');
    expect(job.imported).toBe(65);
    expect(job.transfers).toBe(58);
    expect(job.skipped).toBe(0);
    expect(job.rowErrors).toEqual([]);
    expect(job.statementIban).toBe('CR00010200001234567890');
    expect(job.statementDate).toBe('2026-10-31');
    expect(job.checksum).toMatchObject({ ok: true, expectedOutMinor: 203243, actualOutMinor: 203243, expectedInMinor: 191367, actualInMinor: 191367 });
    expect(service.transactions).toHaveLength(65);
    expect(ingestion.files.get('hash-imp-1')).toBe('DONE');
    // transfers stay out of review: no category needed
    expect(service.transactions.filter((t) => t.kind === 'transfer').every((t) => t.status === 'confirmed')).toBe(true);
  });

  it('skips rows already imported when the same statement is processed again', async () => {
    const ctx = withCsv('bac-statement-usd.csv', 'acc-bac-usd');
    await ctx.pipeline.processCsv(USER, 'imp-1');
    ctx.ingestion.imports.set('imp-2', newJob('imp-2', 'acc-bac-usd', 'hash-imp-2'));
    ctx.raw.objects.set(RawObjectStore.csvKey(USER, 'imp-2'), sample('bac-statement-usd.csv'));
    const again = await ctx.pipeline.processCsv(USER, 'imp-2');
    expect(again.imported).toBe(0);
    expect(again.skipped).toBe(65);
    expect(again.checksum?.ok).toBe(true);
    expect(ctx.service.transactions).toHaveLength(65);
  });

  it('imports the BN sample into BN dólares', async () => {
    const { pipeline } = withCsv('bn-statement-usd.csv', 'acc-bn-usd');
    const job = await pipeline.processCsv(USER, 'imp-1');
    expect(job).toMatchObject({ status: 'DONE', templateId: 'bn-consulta-saldos', imported: 5, transfers: 0 });
    expect(job.checksum).toMatchObject({ ok: true, expectedOutMinor: 130465, expectedInMinor: 130500 });
  });

  it('applies a user rule that replaces the kind (02-S05)', async () => {
    const ctx = withCsv('bac-statement-usd.csv', 'acc-bac-usd');
    ctx.reference.rules.set(`${USER}|dtr-inversiones-hapi-vt`, {
      merchantKey: 'dtr-inversiones-hapi-vt', categoryId: null, tagIds: [], kind: 'transfer', scope: 'USER',
    });
    const job = await ctx.pipeline.processCsv(USER, 'imp-1');
    expect(job.transfers).toBe(59);
  });

  it.each([
    ['bac-statement-usd.csv', 'acc-bn-usd', 'This is a BAC statement, but the account BN dólares is at Banco Nacional.'],
    ['bn-statement-usd.csv', 'acc-bac-usd', 'This is a Banco Nacional statement, but the account BAC dólares is at BAC.'],
    ['bac-statement-usd.csv', 'acc-bac-crc', 'This statement is in USD, but the account BAC colones is in CRC.'],
    ['bac-card-alert.eml', 'acc-bac-usd', 'This file is not a BAC or Banco Nacional statement export.'],
  ])('refuses %s for %s', async (file, accountId, reason) => {
    const { pipeline, ingestion } = withCsv(file, accountId);
    const job = await pipeline.processCsv(USER, 'imp-1');
    expect(job.status).toBe('FAILED');
    expect(job.failureReason).toBe(reason);
    expect(ingestion.files.get('hash-imp-1')).toBe('FAILED');
  });

  it('refuses a BAC file whose detail header has other columns', async () => {
    const text = sample('bac-statement-usd.csv').toString('latin1').replace('Balance de Transacción', 'Saldo');
    const { pipeline } = withCsv(Buffer.from(text, 'latin1'), 'acc-bac-usd');
    const job = await pipeline.processCsv(USER, 'imp-1');
    expect(job.failureReason).toBe("The statement's columns are not the expected ones for BAC.");
  });

  it('reports a bad row with its line number and imports the rest', async () => {
    const text = sample('bn-statement-usd.csv').toString('utf8').replace('0;20/10/2026;85365331;1,000.00;;', '0;32/10/2026;85365331;1,000.00;;');
    const { pipeline } = withCsv(Buffer.from(text), 'acc-bn-usd');
    const job = await pipeline.processCsv(USER, 'imp-1');
    expect(job.status).toBe('DONE');
    expect(job.imported).toBe(4);
    expect(job.rowErrors).toEqual([{ line: 2, reason: 'Unreadable date' }]);
    expect(job.checksum?.ok).toBe(false);
  });

  it('leaves the file reclaimable when rows fail for lack of an exchange rate', async () => {
    const ctx = withCsv('bn-statement-usd.csv', 'acc-bn-crc');
    ctx.service.fxDown = true;
    const job = await ctx.pipeline.processCsv(USER, 'imp-1');
    expect(job.imported).toBe(0);
    expect(job.rowErrors).toHaveLength(5);
    expect(ctx.ingestion.files.get('hash-imp-1')).toBe('FAILED');
  });
});

describe('IngestPipeline.processEmail', () => {
  function withEmail(file: string, dkimPasses = true) {
    const ctx = buildPipeline({ dkimPasses });
    ctx.raw.objects.set('raw/u/m.eml', sample(file));
    return ctx;
  }

  it('imports the BAC alert on the account holding card 1111', async () => {
    const { pipeline, service, ingestion } = withEmail('bac-card-alert.eml');
    const result = await pipeline.processEmail(USER, '<m1>', 'raw/u/m.eml');
    expect(result.status).toBe('imported');
    expect(service.transactions[0]).toMatchObject({
      accountId: 'acc-bac-crc', amountMinor: 200000, currency: 'CRC', kind: 'purchase', merchantRaw: 'FM ESC AVENIDA ESCAZU', sources: ['gmail'],
    });
    expect(ingestion.messages.get('<m1>')).toMatchObject({ status: 'imported', templateId: 'bac-notificacion' });
  });

  it('imports the BN voucher on the account holding card 2222', async () => {
    const { pipeline, service } = withEmail('bn-voucher-digital.eml');
    expect((await pipeline.processEmail(USER, '<m2>', 'raw/u/m.eml')).status).toBe('imported');
    expect(service.transactions[0]).toMatchObject({ accountId: 'acc-bn-crc', amountMinor: 11300 });
  });

  it('answers duplicate for a repeated Message-ID', async () => {
    const { pipeline } = withEmail('bac-card-alert.eml');
    await pipeline.processEmail(USER, '<m1>', 'raw/u/m.eml');
    expect(await pipeline.processEmail(USER, '<m1>', 'raw/u/m.eml')).toMatchObject({ status: 'duplicate' });
  });

  it('rejects an email without a valid signature from the template domain', async () => {
    const { pipeline, service } = withEmail('bac-card-alert.eml', false);
    expect(await pipeline.processEmail(USER, '<m1>', 'raw/u/m.eml')).toMatchObject({ status: 'rejected', reason: 'DKIM_FAILED' });
    expect(service.transactions).toHaveLength(0);
  });

  it('rejects a sender that is not on the allowlist', async () => {
    const ctx = buildPipeline();
    ctx.raw.objects.set('raw/u/x.eml', Buffer.from('From: someone@example.com\r\nSubject: Hi\r\nMessage-ID: <x>\r\n\r\nhello'));
    expect(await ctx.pipeline.processEmail(USER, '<x>', 'raw/u/x.eml')).toMatchObject({ status: 'rejected', reason: 'SENDER_NOT_ALLOWED' });
  });

  it('keeps an allowlisted email with an unknown subject as unparsed NO_TEMPLATE', async () => {
    const ctx = buildPipeline();
    ctx.raw.objects.set('raw/u/x.eml', Buffer.from('From: bncontacto@bncr.fi.cr\r\nSubject: Promo\r\nMessage-ID: <x>\r\n\r\nhello'));
    expect(await ctx.pipeline.processEmail(USER, '<x>', 'raw/u/x.eml')).toMatchObject({ status: 'unparsed', reason: 'NO_TEMPLATE' });
  });

  it('stores an unknown card as unparsed, then imports on retry after the card is added (01-S08c)', async () => {
    const { pipeline, reference, ingestion, service } = withEmail('bac-card-alert.eml');
    reference.accounts.find((a) => a.id === 'acc-bac-crc')!.cardLast4s = [];
    expect(await pipeline.processEmail(USER, '<m1>', 'raw/u/m.eml')).toMatchObject({ status: 'unparsed', reason: 'UNKNOWN_CARD:1111' });
    reference.accounts.find((a) => a.id === 'acc-bac-crc')!.cardLast4s = ['1111'];
    await ingestion.deleteMessage(USER, '<m1>');
    expect((await pipeline.processEmail(USER, '<m1>', 'raw/u/m.eml')).status).toBe('imported');
    expect(service.transactions).toHaveLength(1);
  });

  it('merges an alert into the statement row of the same purchase', async () => {
    const ctx = withEmail('bac-card-alert.eml');
    await ctx.service.save(USER, {
      accountId: 'acc-bac-crc', localDate: '2026-11-10', kind: 'purchase', currency: 'CRC', amountMinor: 200000, merchantRaw: 'FM ESC AVENIDA', source: 'csv',
    }, { categoryId: null, tagIds: [], categorizedBy: 'none', status: 'pending_review' });
    const result = await ctx.pipeline.processEmail(USER, '<m1>', 'raw/u/m.eml');
    expect(result.status).toBe('duplicate');
    expect(ctx.service.transactions).toHaveLength(1);
    expect(ctx.service.transactions[0].sources).toEqual(['csv', 'gmail']);
  });

  it('flags a near match for review', async () => {
    const ctx = withEmail('bac-card-alert.eml');
    const existing = await ctx.service.save(USER, {
      accountId: 'acc-bac-crc', localDate: '2026-11-10', kind: 'purchase', currency: 'CRC', amountMinor: 210000, merchantRaw: 'FM ESC', source: 'csv',
    }, { categoryId: null, tagIds: [], categorizedBy: 'none', status: 'pending_review' });
    await ctx.pipeline.processEmail(USER, '<m1>', 'raw/u/m.eml');
    expect(ctx.service.transactions[1].possibleDuplicateOf).toBe(existing.id);
  });

  it('releases the claim when saving fails, so the script retries', async () => {
    const ctx = withEmail('bac-card-alert.eml');
    ctx.service.fxDown = true;
    await expect(ctx.pipeline.processEmail(USER, '<m1>', 'raw/u/m.eml')).rejects.toThrow('exchange rate');
    expect(ctx.ingestion.messages.has('<m1>')).toBe(false);
  });
});
