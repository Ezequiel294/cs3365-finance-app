import type { Flow, Transaction, TransactionKind } from './types';

/** Transaction.flow(): which way the money moved and whether it counts (class diagram 1a). */
export function flowOf(kind: TransactionKind): Flow {
  switch (kind) {
    case 'purchase':
    case 'sinpe_sent':
    case 'payment_sent':
      return 'expense';
    case 'refund':
      return 'refund';
    case 'income':
    case 'sinpe_received':
      return 'income';
    case 'transfer':
    case 'card_payment':
      return 'excluded';
  }
}

/** Transaction.countsAsSpending(): true for the expense and refund flows. */
export function countsAsSpending(txn: Pick<Transaction, 'kind'>): boolean {
  const f = flowOf(txn.kind);
  return f === 'expense' || f === 'refund';
}

/** Kinds whose money enters the account. */
export function isMoneyIn(kind: TransactionKind): boolean {
  return kind === 'refund' || kind === 'income' || kind === 'sinpe_received';
}

export const KIND_LABELS: Record<TransactionKind, string> = {
  purchase: 'Purchase',
  sinpe_sent: 'SINPE sent',
  payment_sent: 'Bank transfer sent',
  refund: 'Refund',
  income: 'Income',
  sinpe_received: 'SINPE received',
  transfer: 'Between my own accounts',
  card_payment: 'Credit card payment',
};

/** Kinds offered under "Money out" and "Money in" in the add-transaction dialog. */
export const MONEY_OUT_KINDS: TransactionKind[] = [
  'purchase',
  'sinpe_sent',
  'payment_sent',
  'transfer',
  'card_payment',
];
export const MONEY_IN_KINDS: TransactionKind[] = ['income', 'sinpe_received', 'refund', 'transfer'];
