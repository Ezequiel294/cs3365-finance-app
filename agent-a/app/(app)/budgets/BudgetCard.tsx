import Link from 'next/link';
import type { BudgetProgress } from '@/shared/api-types';
import type { Catalog } from '@/shared/api-types';
import { Badge } from '../../ui/Badge';
import { Meter } from '../../ui/charts/Meter';
import { formatDay, formatMoney } from '../../ui/format';

/** "$286 of $300 · 95% · $14 left" or "$136 of $90 · 151% · $46 over". */
export function figures(p: BudgetProgress): string {
  const base = `${formatMoney(p.spentCents)} of ${formatMoney(p.limitCents)} · ${p.percent}%`;
  return p.overByCents > 0 ? `${base} · ${formatMoney(p.overByCents)} over` : `${base} · ${formatMoney(p.remainingCents)} left`;
}

/** Compares spent with the even pace for today: within 5% of the limit either side is "On pace". */
export function paceText(p: BudgetProgress): string {
  const diff = p.spentCents - p.expectedCents;
  if (Math.abs(diff) * 20 <= p.limitCents) return 'On pace';
  return diff > 0 ? `${formatMoney(diff)} ahead of an even pace` : `${formatMoney(-diff)} under an even pace`;
}

export function periodText(p: BudgetProgress, currentYear: number): string {
  const days = `${p.daysLeft} days left`;
  switch (p.budget.period) {
    case 'WEEKLY':
      return `Weekly · ends ${formatDay(p.periodEnd, currentYear)}`;
    case 'MONTHLY':
      return `Monthly · ${days}`;
    case 'QUARTERLY':
      return `Quarterly · ${days}`;
    case 'YEARLY':
      return `Yearly · ${days}`;
    case 'CUSTOM':
      return `${formatDay(p.periodStart, currentYear)} – ${formatDay(p.periodEnd, currentYear)} · ${days}`;
  }
}

/** One budget: filters, period, Meter with the pace tick, figures, pace sentence, links. */
export function BudgetCard({ progress, catalog, currentYear }: { progress: BudgetProgress; catalog: Catalog; currentYear: number }) {
  const p = progress;
  const catNames = p.budget.categoryIds.map((id) => catalog.categories.find((c) => c.id === id)?.name ?? id);
  const tagNames = p.budget.tagIds.map((id) => catalog.tags.find((t) => t.id === id)?.name ?? id);
  return (
    <section className="flex flex-col gap-3 rounded-[8px] border border-border bg-surface p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[20px] font-semibold">{p.budget.name}</h2>
        <span className="text-[13px] text-text-secondary">{periodText(p, currentYear)}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {catNames.length || tagNames.length ? (
          <>
            {catNames.map((n) => (
              <Badge key={`c-${n}`} label={n} />
            ))}
            {tagNames.map((n) => (
              <Badge key={`t-${n}`} label={`# ${n}`} tone="accent" />
            ))}
          </>
        ) : (
          <Badge label="All spending" />
        )}
      </div>
      <Meter valueCents={p.spentCents} limitCents={p.limitCents} markerCents={p.expectedCents} markerLabel={`Even pace today: ${formatMoney(p.expectedCents)}`} figures={figures(p)} />
      <p className="text-sm text-text-secondary">{paceText(p)}</p>
      <div className="flex gap-4 text-sm">
        <Link href={`/budgets?open=${p.budget.id}`} className="text-accent underline">
          Details
        </Link>
        <Link href={`/budgets?edit=${p.budget.id}`} className="text-accent underline">
          Edit
        </Link>
      </div>
    </section>
  );
}
