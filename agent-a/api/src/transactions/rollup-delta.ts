/** One change to one rollup item in `Aggregates`, identified by its sort key. */
export interface RollupDelta {
  key: string;
  expenseCents: number;
  incomeCents: number;
  count: number;
  /** Budget period items only: the limit in force for that period (SET, not ADD). */
  limitCents?: number;
}
