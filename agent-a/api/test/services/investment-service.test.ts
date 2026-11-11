import { GetCommand, PutCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { describe, expect, it } from 'vitest';
import { FixedClock } from '../../src/clock';
import { ConflictError } from '../../src/errors';
import { AggregateRepository } from '../../src/repositories/aggregate-repository';
import { InvestmentTxRepository } from '../../src/repositories/investment-tx-repository';
import { ReferenceRepository } from '../../src/repositories/reference-repository';
import { HoldingCalculator } from '../../src/services/holding-calculator';
import { InvestmentService } from '../../src/services/investment-service';
import { mockedStore } from '../ddb-mock';

const hapi = {
  id: 'brk-hapi', name: 'Hapi', version: 1,
  fees: {
    deposit: { flatCents: 0, percentBps: 155 },
    withdrawal: { flatCents: 2500, percentBps: 0 },
    buy: { security: { flatCents: 15, percentBps: 0 }, crypto: { flatCents: 0, percentBps: 100 } },
    sell: { security: { flatCents: 15, percentBps: 0 }, crypto: { flatCents: 0, percentBps: 100 } },
  },
};

function build(holding?: Record<string, unknown>) {
  const { store, mock } = mockedStore();
  const service = new InvestmentService(
    new InvestmentTxRepository(store, 'Inv'),
    new AggregateRepository(store, 'Agg'),
    new ReferenceRepository(store, 'Ref'),
    store,
    new HoldingCalculator(),
    new FixedClock(new Date('2026-10-14T15:00:00Z')),
  );
  mock.on(GetCommand).callsFake((input) => {
    if (input.Key.SK === 'BROKER#brk-hapi') return { Item: { PK: 'USER#u', SK: input.Key.SK, ...hapi } };
    if (holding && String(input.Key.SK).startsWith('HOLDING#')) return { Item: { PK: 'USER#u', SK: input.Key.SK, ...holding } };
    return {};
  });
  mock.on(TransactWriteCommand).resolves({});
  mock.on(PutCommand).resolves({});
  mock.on(QueryCommand).resolves({ Items: [] });
  return { service, mock };
}

const items = (mock: ReturnType<typeof mockedStore>['mock']) => mock.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems!;

describe('InvestmentService.record', () => {
  it('derives a deposit fee from the schedule and credits the cash that arrives (07-S04)', async () => {
    const { service, mock } = build();
    const r = await service.record('u', { type: 'DEPOSIT', brokerId: 'brk-hapi', localDate: '2026-10-14', amountCents: 30000 });
    expect(r.transaction).toMatchObject({ commissionCents: 465, commissionSource: 'rule' });
    expect(r.cashDeltaCents).toBe(29535);
    const tx = items(mock);
    expect(tx[0].Put?.Item).toMatchObject({ SK: `INV#2026-10-14#${r.transaction.id}`, type: 'DEPOSIT', amountCents: 30000 });
    expect(tx[1].Update?.Key?.SK).toBe('CASH#brk-hapi');
    expect(tx[1].Update?.ExpressionAttributeValues).toMatchObject({ ':a0': 29535 });
    expect(tx[2].Update?.Key?.SK).toBe('MONTH#2026-10#INV');
  });

  it('keeps a commission the user typed as manual', async () => {
    const { service } = build();
    const r = await service.record('u', { type: 'DEPOSIT', brokerId: 'brk-hapi', localDate: '2026-10-14', amountCents: 30000, commissionCents: 500 });
    expect(r.transaction).toMatchObject({ commissionCents: 500, commissionSource: 'manual' });
  });

  it('adds units and cost to the holding on a buy (07-S01)', async () => {
    const { service, mock } = build();
    const r = await service.record('u', {
      type: 'BUY', brokerId: 'brk-hapi', localDate: '2026-10-14', ticker: 'VT', assetClass: 'SECURITY', quantityMicro: 653300, grossCents: 10122,
    });
    expect(r.transaction.commissionCents).toBe(15);
    expect(r.holding).toMatchObject({ quantityMicro: 653300, costBasisCents: 10137 });
    const tx = items(mock);
    expect(tx[0].Put?.Item?.tickerPK).toBe('USER#u#VT');
    expect(tx[1].Update?.Key?.SK).toBe('HOLDING#brk-hapi#VT');
    expect(tx[2].Update?.ExpressionAttributeValues).toMatchObject({ ':a0': -10137 });
  });

  it('prices a crypto buy with the crypto fee', async () => {
    const { service } = build();
    const r = await service.record('u', {
      type: 'BUY', brokerId: 'brk-hapi', localDate: '2026-10-14', ticker: 'BTC-USD', assetClass: 'CRYPTO', quantityMicro: 2712, grossCents: 20000,
    });
    expect(r.transaction.commissionCents).toBe(200);
    expect(r.holding?.costBasisCents).toBe(20200);
  });

  it('conditions a sale on the version and the quantity held', async () => {
    const { service, mock } = build({ brokerId: 'brk-hapi', ticker: 'VT', assetClass: 'SECURITY', quantityMicro: 1_000_000, costBasisCents: 15000, realizedGainCents: 0, version: 4 });
    const r = await service.record('u', { type: 'SELL', brokerId: 'brk-hapi', localDate: '2026-10-14', ticker: 'VT', quantityMicro: 500_000, grossCents: 8000 });
    expect(r.transaction.realizedGainCents).toBe(8000 - 15 - 7500);
    const update = items(mock)[1].Update!;
    expect(update.ConditionExpression).toBe('#cv = :cv AND #cq >= :sold');
    expect(update.ExpressionAttributeValues).toMatchObject({ ':cv': 4, ':sold': 500_000 });
  });

  it('rejects a sale larger than the holding', async () => {
    const { service } = build({ brokerId: 'brk-hapi', ticker: 'VT', assetClass: 'SECURITY', quantityMicro: 100, costBasisCents: 1, realizedGainCents: 0, version: 1 });
    await expect(
      service.record('u', { type: 'SELL', brokerId: 'brk-hapi', localDate: '2026-10-14', ticker: 'VT', quantityMicro: 500, grossCents: 1 }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
