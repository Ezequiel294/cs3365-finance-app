import {
  FeeCalculator,
  feeFor,
  type Broker,
  type Holding,
  type InvestmentChangesInput,
  type InvestmentTransaction,
  type NewInvestmentInput,
} from '@finance/shared';
import type { Clock } from '../clock';
import { ConflictError, NotFoundError, ValidationError } from '../errors';
import { newDatedId } from '../keys';
import type { AggregateRepository } from '../repositories/aggregate-repository';
import { DynamoStore, TransactionCancelledError, type TransactItem } from '../repositories/dynamo-store';
import type { InvestmentTxRepository } from '../repositories/investment-tx-repository';
import type { ReferenceRepository } from '../repositories/reference-repository';
import type { HoldingCalculator } from './holding-calculator';

export interface RecordResult {
  transaction: InvestmentTransaction;
  holding: Holding | null;
  cashDeltaCents: number;
}

/** Records and corrects investment transactions (07-S01, 07-S04). Never touches spending or budgets. */
export class InvestmentService {
  constructor(
    private readonly investments: InvestmentTxRepository,
    private readonly aggregates: AggregateRepository,
    private readonly reference: ReferenceRepository,
    private readonly store: DynamoStore,
    private readonly holdings: HoldingCalculator,
    private readonly clock: Clock,
  ) {}

  async list(userId: string): Promise<InvestmentTransaction[]> {
    return this.investments.list(userId);
  }

  async record(userId: string, input: NewInvestmentInput): Promise<RecordResult> {
    const broker = await this.reference.getBroker(userId, input.brokerId);
    if (!broker) throw new ValidationError('Unknown broker');

    let holding: Holding | undefined;
    let assetClass = 'assetClass' in input ? input.assetClass ?? null : null;
    if (input.type === 'SELL' || input.type === 'BUY') {
      holding = await this.aggregates.getHolding(userId, broker.id, input.ticker);
      if (input.type === 'SELL') assetClass = holding?.assetClass ?? assetClass ?? 'SECURITY';
    }
    const manual = input.commissionCents !== undefined;
    const tx: InvestmentTransaction = {
      id: newDatedId(input.localDate),
      userId,
      brokerId: broker.id,
      type: input.type,
      localDate: input.localDate,
      ticker: 'ticker' in input ? input.ticker : null,
      assetClass,
      quantityMicro: 'quantityMicro' in input ? input.quantityMicro : null,
      grossCents: 'grossCents' in input ? input.grossCents : null,
      amountCents: 'amountCents' in input ? input.amountCents : null,
      commissionCents: 0,
      commissionSource: manual ? 'manual' : 'rule',
      name: input.name ?? holding?.name ?? null,
      version: 1,
      createdAt: this.clock.now().toISOString(),
    };
    tx.commissionCents = manual ? input.commissionCents! : this.deriveCommission(broker, tx);
    if (tx.type === 'WITHDRAWAL' && tx.commissionCents > (tx.amountCents ?? 0)) {
      throw new ValidationError('The withdrawal fee is larger than the amount');
    }

    const items: TransactItem[] = [];
    let newHolding: Holding | null = null;
    if (tx.type === 'BUY') {
      newHolding = this.holdings.applyBuy(holding ?? null, tx);
      items.push(this.aggregates.holdingBuyItem(userId, newHolding, tx.quantityMicro!, tx.grossCents! + tx.commissionCents));
    } else if (tx.type === 'SELL') {
      const result = this.holdings.applySell(holding ?? null, tx);
      tx.realizedGainCents = result.realizedGainCents;
      newHolding = result.holding;
      items.push(this.aggregates.holdingSellItem(userId, holding!, tx.quantityMicro!, result.costRemovedCents, result.realizedGainCents));
    }
    const cashDeltaCents = this.holdings.cashDelta(tx);
    items.unshift(this.investments.putItem(tx));
    items.push(this.aggregates.cashItem(userId, broker.id, cashDeltaCents));
    items.push(this.aggregates.investmentMonthItem(userId, tx.localDate.slice(0, 7), this.holdings.monthContribution(tx)));
    try {
      await this.store.transactWrite(items);
    } catch (err) {
      if (err instanceof TransactionCancelledError) {
        throw new ConflictError('The holding changed meanwhile or is smaller than the sale; reload and try again');
      }
      throw err;
    }
    if (newHolding) newHolding = { ...newHolding, version: (holding?.version ?? 0) + 1 };
    return { transaction: tx, holding: newHolding, cashDeltaCents };
  }

  /**
   * Corrects a recorded transaction. For trades the holding is rebuilt from every
   * trade of that ticker in date order, because an edited old trade changes the
   * cost of every later sale. Cash and the month rollup move by the difference.
   */
  async correct(userId: string, id: string, changes: InvestmentChangesInput): Promise<RecordResult> {
    const old = await this.investments.get(userId, id);
    if (!old) throw new NotFoundError('Investment transaction not found');
    if (old.version !== changes.version) throw new ConflictError('The transaction changed meanwhile; reload it');
    const broker = await this.reference.getBroker(userId, old.brokerId);
    if (!broker) throw new ValidationError('Unknown broker');

    const next: InvestmentTransaction = { ...old, version: old.version + 1 };
    if (old.type === 'DEPOSIT' || old.type === 'WITHDRAWAL') {
      if (changes.amountCents !== undefined) next.amountCents = changes.amountCents;
    } else {
      if (changes.quantityMicro !== undefined) next.quantityMicro = changes.quantityMicro;
      if (changes.grossCents !== undefined) next.grossCents = changes.grossCents;
    }
    if (changes.name !== undefined) next.name = changes.name ?? null;
    if (changes.commissionCents !== undefined) {
      next.commissionCents = changes.commissionCents;
      next.commissionSource = 'manual';
    } else if (old.commissionSource === 'rule') {
      next.commissionCents = this.deriveCommission(broker, next);
    }

    const items: TransactItem[] = [this.investments.updateItem(next, old.version)];
    let rebuilt: Holding | null = null;
    let realizedDelta = 0;
    if (old.type === 'BUY' || old.type === 'SELL') {
      const current = await this.aggregates.getHolding(userId, old.brokerId, old.ticker!);
      const trades = (await this.investments.listByTicker(userId, old.ticker!))
        .filter((t) => t.brokerId === old.brokerId)
        .map((t) => (t.id === next.id ? next : t));
      if (!trades.some((t) => t.id === next.id)) trades.push(next);
      const replay = this.holdings.replay(trades);
      if (next.type === 'SELL') next.realizedGainCents = replay.realizedById.get(next.id) ?? 0;
      realizedDelta = replay.holding.realizedGainCents - (current?.realizedGainCents ?? 0);
      rebuilt = { ...replay.holding, version: (current?.version ?? 0) + 1 };
      items[0] = this.investments.updateItem(next, old.version);
      items.push(this.aggregates.holdingPutItem(userId, rebuilt, current?.version ?? 0));
    }

    const cashDeltaCents = this.holdings.cashDelta(next) - this.holdings.cashDelta(old);
    if (cashDeltaCents !== 0) items.push(this.aggregates.cashItem(userId, old.brokerId, cashDeltaCents));
    const month: Record<string, number> = {};
    const before = this.holdings.monthContribution(old);
    const after = this.holdings.monthContribution(next);
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (key === 'realizedGainCents') continue;
      const diff = (after[key] ?? 0) - (before[key] ?? 0);
      if (diff !== 0) month[key] = diff;
    }
    if (realizedDelta !== 0) month.realizedGainCents = realizedDelta;
    if (Object.keys(month).length > 0) items.push(this.aggregates.investmentMonthItem(userId, old.localDate.slice(0, 7), month));

    try {
      await this.store.transactWrite(items);
    } catch (err) {
      if (err instanceof TransactionCancelledError) throw new ConflictError('The transaction or holding changed meanwhile; reload it');
      throw err;
    }
    return { transaction: next, holding: rebuilt, cashDeltaCents };
  }

  /** The commission from the broker's fee schedule when the user did not type one. */
  private deriveCommission(broker: Broker, tx: InvestmentTransaction): number {
    const base = tx.type === 'DEPOSIT' || tx.type === 'WITHDRAWAL' ? tx.amountCents ?? 0 : tx.grossCents ?? 0;
    return FeeCalculator.fee(feeFor(broker.fees, tx.type, tx.assetClass), base);
  }
}
