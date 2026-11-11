'use client';

import { formatUsd, WEEK_DAYS, type Budget, type BudgetProgress, type BurndownSeries, type Category, type Tag, type WeekDay } from '@finance/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { getBurndown } from '@/app/actions/budgets';
import { saveSettings } from '@/app/actions/transactions';
import { BudgetForm } from './budget-form';
import { BurndownChart } from './burndown-chart';

export function BudgetsManager({
  progress,
  budgets,
  categories,
  tags,
  weekStart,
}: {
  progress: BudgetProgress[];
  budgets: Budget[];
  categories: Category[];
  tags: Tag[];
  weekStart: WeekDay;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Budget | null>(null);
  const [open, setOpen] = useState<{ id: string; series: BurndownSeries } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function show(id: string) {
    if (open?.id === id) return setOpen(null);
    const r = await getBurndown(id);
    if (!r.ok) return setError(r.error);
    setOpen({ id, series: r.data });
  }

  async function changeWeekStart(day: string) {
    const r = await saveSettings(day, 'America/Costa_Rica');
    if (!r.ok) return setError(r.error);
    router.refresh();
  }

  return (
    <>
      {error && <p className="error">{error}</p>}
      <div className="card">
        {progress.length === 0 && <p className="muted">No budgets yet.</p>}
        {progress.map((p) => (
          <div key={p.budget.id} style={{ marginBottom: '0.9rem' }}>
            <div className="row" style={{ alignItems: 'center' }}>
              <div>
                <strong>{p.budget.name}</strong>{' '}
                <span>
                  {p.percent}% ({formatUsd(p.spentCents)} of {formatUsd(p.limitCents)}
                  {p.overByCents > 0 ? <span className="error">, {formatUsd(p.overByCents)} over</span> : `, ${formatUsd(p.remainingCents)} left`})
                </span>
                <div className="muted">
                  {p.budget.period.toLowerCase()} · {p.periodStart} to {p.periodEnd}
                </div>
              </div>
              <div style={{ flex: '0 0 auto' }}>
                <button className="secondary" type="button" onClick={() => show(p.budget.id)}>
                  {open?.id === p.budget.id ? 'Hide' : 'Burn-down'}
                </button>{' '}
                <button className="secondary" type="button" onClick={() => setEditing(budgets.find((b) => b.id === p.budget.id) ?? p.budget)}>
                  Edit
                </button>
              </div>
            </div>
            <div className={`bar ${p.percent > 100 ? 'over' : ''}`} title={`${p.percent}%`}>
              <span style={{ width: `${Math.min(100, p.percent)}%` }} />
            </div>
            {open?.id === p.budget.id && <BurndownChart series={open.series} />}
          </div>
        ))}
        <p className="muted">
          Weeks start on{' '}
          <select value={weekStart} onChange={(e) => changeWeekStart(e.target.value)} style={{ width: 'auto' }}>
            {WEEK_DAYS.map((d) => (
              <option key={d} value={d}>
                {d.charAt(0) + d.slice(1).toLowerCase()}
              </option>
            ))}
          </select>{' '}
          (changing it applies to weekly budgets from their next rebuild).
        </p>
      </div>
      {editing ? (
        <BudgetForm key={editing.id} budget={editing} categories={categories} tags={tags} onDone={() => setEditing(null)} />
      ) : (
        <BudgetForm categories={categories} tags={tags} onDone={() => undefined} />
      )}
    </>
  );
}
