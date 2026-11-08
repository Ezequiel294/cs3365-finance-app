import type { Holding, InvestmentChanges, InvestmentTransaction, NewInvestmentTransaction } from "@finance/shared";
import type { Clock } from "../clock";
import { ConflictError, NotFoundError, ValidationError } from "../http/errors";
import { datedId } from "../ids";
import type { AggregateRepository, InvestmentMonthChange } from "../repositories/aggregate-repository";
import type { DynamoStore, TransactItem } from "../repositories/dynamo-store";
import type { InvestmentTxRepository } from "../repositories/investment-tx-repository";
import type { ReferenceRepository } from "../repositories/reference-repository";
import type { HoldingCalculator } from "./holding-calculator";

export interface RecordResult {
  transaction: InvestmentTransaction;
  holding?: Holding;
}

/**
 * Records deposits, withdrawals, buys, and sells. The investment transaction and its holding, cash,
 * and month rollups are written in one TransactWriteItems. Investments never count as spending.
 */
export class InvestmentService {
  constructor(
    private readonly store: DynamoStore,
    private readonly investments: InvestmentTxRepository,
    private readonly aggregates: AggregateRepository,
    private readonly reference: ReferenceRepository,
    private readonly calculator: HoldingCalculator,
    private readonly clock: Clock,
  ) {}

  list(userId: string): Promise<InvestmentTransaction[]> {
    return this.investments.listAll(userId);
  }

  async record(userId: string, input: NewInvestmentTransaction): Promise<RecordResult> {
    const broker = await this.reference.getBroker(userId, input.brokerId);
    if (!broker) throw new ValidationError("unknown broker", "UNKNOWN_BROKER");
    const isTrade = input.type === "BUY" || input.type === "SELL";
    const tx: InvestmentTransaction = {
      id: datedId(input.localDate),
      userId,
      brokerId: input.brokerId,
      type: input.type,
      localDate: input.localDate,
      ticker: isTrade ? input.ticker : undefined,
      quantityMicro: isTrade ? input.quantityMicro : undefined,
      grossCents: isTrade ? input.grossCents : undefined,
      amountCents: isTrade ? undefined : input.amountCents,
      commissionCents: input.commissionCents,
      name: input.name,
      createdAt: this.clock.now().toISOString(),
      version: 1,
    };

    for (let attempt = 0; ; attempt++) {
      const items: TransactItem[] = [this.investments.putItem(tx)];
      let gain = 0;
      if (tx.type === "BUY") {
        items.push(
          this.aggregates.holdingAddItem(userId, tx.brokerId, tx.ticker!, {
            quantityMicro: tx.quantityMicro!,
            costBasisCents: tx.grossCents! + tx.commissionCents,
            realizedGainCents: 0,
          }),
        );
      } else if (tx.type === "SELL") {
        const holding = await this.aggregates.getHolding(userId, tx.brokerId, tx.ticker!);
        if (!holding || holding.quantityMicro < tx.quantityMicro!) {
          throw new ConflictError("You hold fewer units than this sale", "INSUFFICIENT_HOLDING");
        }
        const result = this.calculator.applySell(holding, tx);
        gain = result.realizedGainCents;
        tx.realizedGainCents = gain;
        items[0] = this.investments.putItem(tx);
        items.push(
          this.aggregates.holdingAddItem(
            userId,
            tx.brokerId,
            tx.ticker!,
            { quantityMicro: -tx.quantityMicro!, costBasisCents: -result.costRemovedCents, realizedGainCents: gain },
            { expectedVersion: holding.version, minQuantityMicro: tx.quantityMicro! },
          ),
        );
      }
      items.push(this.aggregates.cashAddItem(userId, tx.brokerId, this.calculator.cashDelta(tx)));
      const month = this.aggregates.investmentMonthAddItem(userId, tx.localDate.slice(0, 7), this.calculator.monthChange(tx, gain));
      if (month) items.push(month);
      try {
        await this.store.transactWrite(items);
        break;
      } catch (error) {
        if (error instanceof ConflictError && attempt === 0 && tx.type === "SELL") continue;
        if (error instanceof ConflictError && tx.type === "SELL") {
          throw new ConflictError("The holding changed or holds fewer units than this sale; reload and try again", "INSUFFICIENT_HOLDING");
        }
        throw error;
      }
    }
    const holding = tx.ticker ? await this.aggregates.getHolding(userId, tx.brokerId, tx.ticker) : undefined;
    return { transaction: tx, holding };
  }

  /**
   * Corrects an investment transaction, then rebuilds the holding from every trade of that ticker in
   * date order and adjusts cash, month rollups, and later sales' realized gains in the same write.
   */
  async correct(userId: string, id: string, changes: InvestmentChanges): Promise<RecordResult> {
    for (let attempt = 0; ; attempt++) {
      const old = await this.investments.get(userId, id);
      if (!old) throw new NotFoundError("investment transaction not found");
      if (attempt === 0 && old.version !== changes.version) throw new ConflictError("The transaction changed meanwhile; reload it and try again");
      const isTrade = old.type === "BUY" || old.type === "SELL";
      const next: InvestmentTransaction = {
        ...old,
        quantityMicro: isTrade ? changes.quantityMicro ?? old.quantityMicro : undefined,
        grossCents: isTrade ? changes.grossCents ?? old.grossCents : undefined,
        amountCents: isTrade ? undefined : changes.amountCents ?? old.amountCents,
        commissionCents: changes.commissionCents ?? old.commissionCents,
        name: changes.name ?? old.name,
        version: old.version + 1,
      };
      if (!isTrade && !(next.amountCents && next.amountCents > 0)) throw new ValidationError("a deposit or withdrawal needs an amount");

      const items: TransactItem[] = [];
      const monthDeltas = new Map<string, InvestmentMonthChange>();
      const addMonth = (month: string, change: InvestmentMonthChange, sign: 1 | -1) => {
        const acc = monthDeltas.get(month) ?? {};
        for (const [k, v] of Object.entries(change) as [keyof InvestmentMonthChange, number][]) acc[k] = (acc[k] ?? 0) + sign * v;
        monthDeltas.set(month, acc);
      };

      let oldGain = old.realizedGainCents ?? 0;
      let newGain = 0;
      let rebuilt: Holding | undefined;
      if (isTrade && old.ticker) {
        const trades = (await this.investments.listByTicker(userId, old.ticker)).filter((t) => t.brokerId === old.brokerId);
        const replaced = trades.map((t) => (t.id === id ? next : t));
        const { holding, gains } = this.calculator.replayDetailed(replaced);
        newGain = gains.get(id) ?? 0;
        next.realizedGainCents = old.type === "SELL" ? newGain : undefined;
        for (const t of trades) {
          if (t.id === id || t.type !== "SELL") continue;
          const updatedGain = gains.get(t.id) ?? 0;
          const previous = t.realizedGainCents ?? 0;
          if (updatedGain !== previous) {
            items.push(this.investments.updateItem({ ...t, realizedGainCents: updatedGain, version: t.version + 1 }, t.version));
            addMonth(t.localDate.slice(0, 7), { realizedGainCents: updatedGain - previous }, 1);
          }
        }
        const current = await this.aggregates.getHolding(userId, old.brokerId, old.ticker);
        rebuilt = { ...holding, brokerId: old.brokerId, ticker: old.ticker };
        items.push(this.aggregates.putHoldingItem(userId, rebuilt, current?.version ?? 0));
      } else {
        oldGain = 0;
      }

      items.unshift(this.investments.updateItem(next, old.version));
      const cashChange = this.calculator.cashDelta(next) - this.calculator.cashDelta(old);
      if (cashChange !== 0) items.push(this.aggregates.cashAddItem(userId, old.brokerId, cashChange));
      const month = old.localDate.slice(0, 7);
      addMonth(month, this.calculator.monthChange(old, oldGain), -1);
      addMonth(month, this.calculator.monthChange(next, newGain), 1);
      for (const [m, change] of monthDeltas) {
        const item = this.aggregates.investmentMonthAddItem(userId, m, change);
        if (item) items.push(item);
      }
      if (items.length > 100) throw new ValidationError("too many later trades to correct in one step");
      try {
        await this.store.transactWrite(items);
        const holding = rebuilt ? await this.aggregates.getHolding(userId, old.brokerId, old.ticker!) : undefined;
        return { transaction: next, holding };
      } catch (error) {
        if (error instanceof ConflictError && attempt === 0) continue;
        throw error;
      }
    }
  }
}
