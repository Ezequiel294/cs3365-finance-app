import type { Flow, TransactionKind } from './types';

const FLOW_BY_KIND: Record<TransactionKind, Flow> = {
  purchase: 'expense',
  sinpe_sent: 'expense',
  payment_sent: 'expense',
  refund: 'refund',
  income: 'income',
  sinpe_received: 'income',
  transfer: 'excluded',
  card_payment: 'excluded',
};

/** `Transaction.flow()`: which way the money moved and whether it counts. */
export function flowOf(kind: TransactionKind): Flow {
  return FLOW_BY_KIND[kind];
}

/** `Transaction.countsAsSpending()`: true for the expense and refund flows. */
export function countsAsSpending(kind: TransactionKind): boolean {
  const flow = flowOf(kind);
  return flow === 'expense' || flow === 'refund';
}

/** Direction of money for a kind: out for spending and transfers out, in otherwise. */
export function defaultDirection(kind: TransactionKind): 'out' | 'in' {
  return kind === 'refund' || kind === 'income' || kind === 'sinpe_received' ? 'in' : 'out';
}
