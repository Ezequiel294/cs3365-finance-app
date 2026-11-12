import Link from 'next/link';
import type { BudgetProgress } from '@/shared/api-types';
import { ButtonLink } from '../../ui/Button';
import { Meter } from '../../ui/charts/Meter';
import { SectionEmpty } from '../../ui/EmptyState';
import { formatMoney } from '../../ui/format';
import { figures } from '../budgets/BudgetCard';

/** The four budgets with the highest percent, each with its name, Meter, and figures (03-S11). */
export function BudgetStrip({ budgets }: { budgets: BudgetProgress[] }) {
  if (!budgets.length) {
    return (
      <SectionEmpty
        title="No budgets yet"
        body="Set a limit for a category or a tag to see it here."
        actions={<ButtonLink href="/budgets?new=1">Create a budget</ButtonLink>}
      />
    );
  }
  const top = [...budgets].sort((a, b) => b.percent - a.percent).slice(0, 4);
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-4">
        {top.map((p) => (
          <li key={p.budget.id} className="flex flex-col gap-1">
            <span className="text-sm font-medium">{p.budget.name}</span>
            <Meter valueCents={p.spentCents} limitCents={p.limitCents} markerCents={p.expectedCents} markerLabel={`Even pace today: ${formatMoney(p.expectedCents)}`} figures={figures(p)} />
          </li>
        ))}
      </ul>
      <Link href="/budgets" className="text-sm text-accent underline">
        All budgets
      </Link>
    </div>
  );
}
