'use client';

import { BUDGET_PERIODS, parseAmountInput, type Budget, type BudgetPeriod, type Category, type Tag } from '@finance/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createBudget, updateBudget } from '@/app/actions/budgets';

const PERIOD_LABEL: Record<BudgetPeriod, string> = {
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  YEARLY: 'Yearly',
  CUSTOM: 'Custom dates',
};

/** Create a budget (03-S02) or change its period, filters, or limit (03-S10). */
export function BudgetForm({ budget, categories, tags, onDone }: { budget?: Budget; categories: Category[]; tags: Tag[]; onDone: () => void }) {
  const router = useRouter();
  const [period, setPeriod] = useState<BudgetPeriod>(budget?.period ?? 'MONTHLY');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(form: FormData) {
    const limitCents = parseAmountInput(String(form.get('limit') ?? ''));
    if (!limitCents) return setError('Enter a limit in USD.');
    const input = {
      name: String(form.get('name')),
      categoryIds: form.getAll('categoryIds').map(String),
      tagIds: form.getAll('tagIds').map(String),
      period,
      limitCents,
      startDate: period === 'CUSTOM' ? String(form.get('startDate')) : null,
      endDate: period === 'CUSTOM' ? String(form.get('endDate')) : null,
    };
    setPending(true);
    const result = budget ? await updateBudget(budget.id, { ...input, version: budget.version }) : await createBudget(input);
    setPending(false);
    if (!result.ok) return setError(result.status === 409 ? 'The budget changed meanwhile. Reload the page.' : result.error);
    onDone();
    router.refresh();
  }

  return (
    <form action={submit} className="card">
      <h2>{budget ? `Edit ${budget.name}` : 'New budget'}</h2>
      {error && <p className="error">{error}</p>}
      <div className="row">
        <div>
          <label htmlFor="b-name">Name</label>
          <input id="b-name" name="name" defaultValue={budget?.name} required placeholder="University" />
        </div>
        <div>
          <label htmlFor="b-limit">Limit (USD)</label>
          <input id="b-limit" name="limit" inputMode="decimal" defaultValue={budget ? (budget.limitCents / 100).toFixed(2) : ''} required />
        </div>
        <div>
          <label htmlFor="b-period">Period</label>
          <select id="b-period" value={period} onChange={(e) => setPeriod(e.target.value as BudgetPeriod)}>
            {BUDGET_PERIODS.map((p) => (
              <option key={p} value={p}>
                {PERIOD_LABEL[p]}
              </option>
            ))}
          </select>
        </div>
      </div>
      {period === 'CUSTOM' && (
        <div className="row">
          <div>
            <label htmlFor="b-start">Start</label>
            <input id="b-start" name="startDate" type="date" defaultValue={budget?.startDate ?? ''} required />
          </div>
          <div>
            <label htmlFor="b-end">End</label>
            <input id="b-end" name="endDate" type="date" defaultValue={budget?.endDate ?? ''} required />
          </div>
        </div>
      )}
      <div className="row">
        <div>
          <label htmlFor="b-cats">Categories (none selected = all)</label>
          <select id="b-cats" name="categoryIds" multiple size={5} defaultValue={budget?.categoryIds}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="b-tags">Tags, any of (none selected = all)</label>
          <select id="b-tags" name="tagIds" multiple size={5} defaultValue={budget?.tagIds}>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="row" style={{ marginTop: '0.8rem' }}>
        <button type="submit" disabled={pending}>
          {budget ? 'Save' : 'Create budget'}
        </button>
        {budget && (
          <button type="button" className="secondary" onClick={onDone}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
