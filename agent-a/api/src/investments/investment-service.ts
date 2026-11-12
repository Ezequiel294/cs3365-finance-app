import type { RecordInvestmentResult } from '../../../shared/api-types';
import { addMonths } from '../../../shared/dates';
import { FeeCalculator, feeFor } from '../../../shared/fee-calculator';
import type { InvestmentChanges, NewInvestmentTransaction } from '../../../shared/schemas';
import type { Broker, Holding, InvestmentMonthRollup, InvestmentTransaction } from '../../../shared/types';
import type { Clock } from '../clock';
import { DEFAULT_TIME_ZONE } from '../categorization/settings-service';
import { ConflictError, NotFoundError, ValidationError } from '../http/errors';
import { datedId } from '../ids';
import type { AggregateRepository, InvestmentMonthDelta } from '../repositories/aggregate-repository';
import { type DynamoStore, type TransactItem, failedConditionIndexes } from '../repositories/dynamo-store';
import type { InvestmentTxRepository } from '../repositories/investment-tx-repository';
import type { ReferenceRepository } from '../repositories/reference-repository';
import { type HoldingCalculator, subtractMonthDelta } from './holding-calculator';

/** Deposits, withdrawals, buys, and sells, with holdings and cash in the same write (07-S01, 07-S04). */
export class InvestmentService {
  constructor(
    private readonly reference: Pick<ReferenceRepository, 'getBroker' | 'getSettings'>,
    private readonly investments: Pick<InvestmentTxRepository, 'get' | 'list' | 'listByTicker' | 'putItem' | 'updateItem'>,
    private readonly aggregates: Pick<
      AggregateRepository,
      'getHolding' | 'putHoldingItem' | 'cashItem' | 'investmentMonthItem' | 'getInvestmentMonths' | 'getCash'
    >,
    private readonly calculator: HoldingCalculator,
    private readonly store: Pick<DynamoStore, 'transactWrite'>,
    private readonly clock: Clock,
  ) {}

  async record(userId: string, input: NewInvestmentTransaction): Promise<RecordInvestmentResult> {
    const broker = await this.reference.getBroker(userId, input.brokerId);
    if (!broker) throw new ValidationError('Choose one of your brokers.', { brokerId: 'Unknown broker' });
    const isTrade = input.type === 'BUY' || input.type === 'SELL';
    const manual = input.commissionCents !== undefined;
    const base: Omit<InvestmentTransaction, 'commissionCents' | 'commissionSource'> = {
      id: datedId(input.localDate),
      userId,
      brokerId: broker.id,
      type: input.type,
      localDate: input.localDate,
      ticker: isTrade ? input.ticker : null,
      assetClass: isTrade ? input.assetClass : null,
      quantityMicro: isTrade ? input.quantityMicro : 0,
      grossCents: isTrade ? input.grossCents : 0,
      amountCents: isTrade ? 0 : input.amountCents,
      name: input.name ?? null,
      version: 1,
      createdAt: this.clock.now().toISOString(),
    };
    const tx: InvestmentTransaction = {
      ...base,
      commissionCents: manual ? input.commissionCents! : this.deriveCommission(broker, base),
      commissionSource: manual ? 'manual' : 'rule',
    };

    for (let attempt = 0; attempt < 2; attempt++) {
      const items: TransactItem[] = [this.investments.putItem(tx)];
      let holding: Holding | null = null;
      let realized = 0;
      if (isTrade) {
        const current = await this.aggregates.getHolding(userId, broker.id, tx.ticker!);
        if (tx.type === 'BUY') holding = this.calculator.applyBuy(current, tx);
        else {
          const r = this.calculator.applySell(current, tx);
          holding = r.holding;
          realized = r.realizedGainCents;
        }
        items.push(this.aggregates.putHoldingItem(userId, holding, current?.version ?? 0));
      }
      const cashDelta = this.calculator.cashDelta(tx);
      items.push(this.aggregates.cashItem(userId, broker.id, cashDelta));
      items.push(this.aggregates.investmentMonthItem(userId, this.calculator.monthDelta(tx, realized)));
      try {
        await this.store.transactWrite(items);
      } catch (e) {
        const failed = failedConditionIndexes(e);
        if (failed?.includes(1) && attempt === 0) continue; // the holding changed meanwhile
        if (failed?.length) throw new ConflictError('The holding changed while saving. Try again.');
        throw e;
      }
      const cash = (await this.aggregates.getCash(userId)).find((c) => c.brokerId === broker.id) ?? null;
      return { transaction: tx, holding, cash };
    }
    throw new ConflictError('The holding changed while saving. Try again.');
  }

  /** Correct a recorded transaction; a trade's holding is replayed from every trade of its ticker. */
  async correct(userId: string, id: string, changes: InvestmentChanges): Promise<InvestmentTransaction> {
    const old = await this.investments.get(userId, id);
    if (!old) throw new NotFoundError('Investment transaction not found.');
    if (old.version !== changes.version) {
      throw new ConflictError('This transaction was changed somewhere else. Reload and try again.');
    }
    const broker = await this.reference.getBroker(userId, old.brokerId);
    if (!broker) throw new NotFoundError('Broker not found.');
    const isTrade = old.type === 'BUY' || old.type === 'SELL';
    const draft: InvestmentTransaction = {
      ...old,
      quantityMicro: isTrade ? (changes.quantityMicro ?? old.quantityMicro) : 0,
      grossCents: isTrade ? (changes.grossCents ?? old.grossCents) : 0,
      amountCents: isTrade ? 0 : (changes.amountCents ?? old.amountCents),
      name: changes.name !== undefined ? changes.name : old.name,
      version: old.version + 1,
    };
    const baseChanged = draft.grossCents !== old.grossCents || draft.amountCents !== old.amountCents;
    if (typeof changes.commissionCents === 'number') {
      draft.commissionCents = changes.commissionCents;
      draft.commissionSource = 'manual';
    } else if (changes.commissionCents === null || (old.commissionSource === 'rule' && baseChanged)) {
      draft.commissionCents = this.deriveCommission(broker, draft);
      draft.commissionSource = 'rule';
    }

    const items: TransactItem[] = [this.investments.updateItem(draft, old.version)];
    const monthDeltas: InvestmentMonthDelta[] = [];
    if (isTrade) {
      const trades = (await this.investments.listByTicker(userId, old.ticker!)).filter((t) => t.brokerId === old.brokerId);
      const before = this.calculator.replay(trades);
      const after = this.calculator.replay(trades.map((t) => (t.id === draft.id ? draft : t)));
      const current = await this.aggregates.getHolding(userId, old.brokerId, old.ticker!);
      const replayed: Holding = {
        ...(after.holding ?? {
          brokerId: old.brokerId,
          ticker: old.ticker!,
          assetClass: old.assetClass ?? 'SECURITY',
          name: old.name,
          quantityMicro: 0,
          costBasisCents: 0,
          realizedGainCents: 0,
        }),
        version: (current?.version ?? 0) + 1,
      };
      items.push(this.aggregates.putHoldingItem(userId, replayed, current?.version ?? 0));
      // Every sell whose realized gain changed moves its own month's figure.
      for (const t of trades) {
        if (t.type !== 'SELL') continue;
        const was = before.realizedById.get(t.id) ?? 0;
        const now = after.realizedById.get(t.id) ?? 0;
        const tNew = t.id === draft.id ? draft : t;
        const d = subtractMonthDelta(this.calculator.monthDelta(tNew, now), this.calculator.monthDelta(t, was));
        if (t.id !== draft.id) {
          d.soldCents = 0;
          d.commissionsCents = 0;
        }
        monthDeltas.push(d);
      }
      if (draft.type === 'BUY') {
        monthDeltas.push(subtractMonthDelta(this.calculator.monthDelta(draft), this.calculator.monthDelta(old)));
      }
    } else {
      monthDeltas.push(subtractMonthDelta(this.calculator.monthDelta(draft), this.calculator.monthDelta(old)));
    }
    const cashChange = this.calculator.cashDelta(draft) - this.calculator.cashDelta(old);
    if (cashChange !== 0) items.push(this.aggregates.cashItem(userId, old.brokerId, cashChange));
    for (const d of mergeMonthDeltas(monthDeltas)) items.push(this.aggregates.investmentMonthItem(userId, d));
    try {
      await this.store.transactWrite(items);
    } catch (e) {
      if (failedConditionIndexes(e)?.length) {
        throw new ConflictError('This transaction was changed somewhere else. Reload and try again.');
      }
      throw e;
    }
    return draft;
  }

  async list(userId: string): Promise<InvestmentTransaction[]> {
    const items = await this.investments.list(userId);
    return items.sort((a, b) =>
      a.localDate === b.localDate ? b.createdAt.localeCompare(a.createdAt) : b.localDate.localeCompare(a.localDate),
    );
  }

  /** The last `months` months ending with the current one; a month without an item is all zeros. */
  async monthlyFlows(userId: string, months: number): Promise<InvestmentMonthRollup[]> {
    const settings = await this.reference.getSettings(userId);
    const current = this.clock.today(settings?.timeZone ?? DEFAULT_TIME_ZONE).slice(0, 7);
    const list = Array.from({ length: months }, (_, i) => addMonths(current, i - months + 1));
    const rows = await this.aggregates.getInvestmentMonths(userId, list);
    const byMonth = new Map(rows.map((r) => [r.month, r]));
    return list.map(
      (month) =>
        byMonth.get(month) ?? {
          month,
          depositedCents: 0,
          withdrawnCents: 0,
          boughtCents: 0,
          soldCents: 0,
          commissionsCents: 0,
          realizedGainCents: 0,
        },
    );
  }

  /** The broker's fee for the operation, on the amount sent or the gross value. */
  private deriveCommission(
    broker: Broker,
    tx: Pick<InvestmentTransaction, 'type' | 'assetClass' | 'amountCents' | 'grossCents'>,
  ): number {
    const base = tx.type === 'BUY' || tx.type === 'SELL' ? tx.grossCents : tx.amountCents;
    return FeeCalculator.fee(feeFor(broker, tx.type, tx.assetClass), base);
  }
}

function mergeMonthDeltas(deltas: InvestmentMonthDelta[]): InvestmentMonthDelta[] {
  const byMonth = new Map<string, InvestmentMonthDelta>();
  const keys = ['depositedCents', 'withdrawnCents', 'boughtCents', 'soldCents', 'commissionsCents', 'realizedGainCents'] as const;
  for (const d of deltas) {
    const cur = byMonth.get(d.month) ?? { month: d.month };
    for (const k of keys) cur[k] = (cur[k] ?? 0) + (d[k] ?? 0);
    byMonth.set(d.month, cur);
  }
  return [...byMonth.values()].filter((d) => keys.some((k) => (d[k] ?? 0) !== 0));
}
