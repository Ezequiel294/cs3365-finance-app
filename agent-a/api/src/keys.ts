import type { RollupDimension } from "@finance/shared";

/** Every DynamoDB key string is built here (sequence diagram README, "Keys and indexes"). */
export class Keys {
  static readonly GLOBAL = "GLOBAL";
  static readonly PROFILE = "PROFILE";
  /** Sort key used by single-item global partitions (FX rates, prices, ingest tokens). */
  static readonly ITEM = "ITEM";

  static user(userId: string): string {
    return `USER#${userId}`;
  }

  // ----- Transactions -----
  static txn(date: string, id: string): string {
    return `TXN#${date}#${id}`;
  }
  static txnRangeStart(from: string): string {
    return `TXN#${from}`;
  }
  /** `~` sorts after every character used in IDs, so the range includes the whole `to` day. */
  static txnRangeEnd(to: string): string {
    return `TXN#${to}~`;
  }
  static reviewSK(reason: string, date: string, id: string): string {
    return `${reason}#${date}#${id}`;
  }

  // ----- Investments -----
  static inv(date: string, id: string): string {
    return `INV#${date}#${id}`;
  }
  static tickerPK(userId: string, ticker: string): string {
    return `USER#${userId}#${ticker}`;
  }

  // ----- Aggregates -----
  static day(date: string): string {
    return `DAY#${date}#TOTAL`;
  }
  static month(month: string, dimension: RollupDimension | "INV", id?: string): string {
    if (dimension === "TOTAL" || dimension === "INV") return `MONTH#${month}#${dimension}`;
    if (!id) throw new Error(`month key for ${dimension} needs an id`);
    return `MONTH#${month}#${dimension}#${id}`;
  }
  static monthPrefix(month: string, dimension: "CAT" | "TAG"): string {
    return `MONTH#${month}#${dimension}#`;
  }
  static budgetPeriod(budgetId: string, periodStart: string): string {
    return `BUDGET#${budgetId}#P#${periodStart}`;
  }
  static budgetDay(budgetId: string, date: string): string {
    return `BUDGET#${budgetId}#D#${date}`;
  }
  static budgetPrefix(budgetId: string): string {
    return `BUDGET#${budgetId}#`;
  }
  static holding(brokerId: string, ticker: string): string {
    return `HOLDING#${brokerId}#${ticker}`;
  }
  static cash(brokerId: string): string {
    return `CASH#${brokerId}`;
  }
  static fx(date: string): string {
    return `FX#USD-CRC#${date}`;
  }
  static price(ticker: string): string {
    return `PRICE#${ticker}`;
  }

  // ----- Reference -----
  static account(id: string): string {
    return `ACCOUNT#${id}`;
  }
  static category(id: string): string {
    return `CAT#${id}`;
  }
  static tag(id: string): string {
    return `TAG#${id}`;
  }
  static rule(merchantKey: string): string {
    return `RULE#${merchantKey}`;
  }
  static budget(id: string): string {
    return `BUDGET#${id}`;
  }
  static broker(id: string): string {
    return `BROKER#${id}`;
  }

  // ----- Ingestion -----
  static connection(id: string): string {
    return `CONN#gmail#${id}`;
  }
  static message(messageId: string): string {
    return `MSG#${messageId}`;
  }
  static importJob(id: string): string {
    return `IMPORT#${id}`;
  }
  static file(sha256: string): string {
    return `FILE#${sha256}`;
  }
  static rowFingerprint(hash: string): string {
    return `ROWFP#${hash}`;
  }
  static token(hash: string): string {
    return `TOKEN#${hash}`;
  }
}
