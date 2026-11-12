import { getBurndown, getProgress } from '../../actions/budget-actions';
import { loadCatalog, loadToday } from '../../lib/loaders';
import { EmptyState } from '../../ui/EmptyState';
import { ErrorState } from '../../ui/ErrorState';
import { PageHeader } from '../../ui/PageHeader';
import { BudgetCard } from './BudgetCard';
import { BudgetDialogLauncher } from './BudgetDialog';
import { BurndownSection } from './BurndownSection';

export const dynamic = 'force-dynamic';

/** How much of each limit have I used, and am I going too fast? (03-S02, 03-S10, 03-S11) */
export default async function BudgetsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const [progress, catalog, { today, currentYear }] = await Promise.all([getProgress(), loadCatalog(), loadToday()]);
  const cat = catalog.ok ? catalog.data : { categories: [], tags: [] };
  if (!progress.ok) return <><PageHeader title="Budgets" /><ErrorState message={progress.message} /></>;

  const budgets = [...progress.data].sort((a, b) => Number(b.overByCents > 0) - Number(a.overByCents > 0) || b.percent - a.percent);
  const editing = params.edit ? (budgets.find((b) => b.budget.id === params.edit)?.budget ?? null) : null;
  const launcher = <BudgetDialogLauncher catalog={cat} editing={editing} startOpen={Boolean(params.new || editing)} />;

  if (!budgets.length) {
    return (
      <>
        <PageHeader title="Budgets" primaryAction={launcher} />
        <EmptyState
          title="No budgets yet"
          body="A budget is a limit for a category, a tag, or both. For example, $300 a month for everything tagged University."
          actions={<BudgetDialogLauncher catalog={cat} editing={null} startOpen={false} variant="secondary" />}
        />
      </>
    );
  }

  const over = budgets.filter((b) => b.overByCents > 0).length;
  const open = params.open ? budgets.find((b) => b.budget.id === params.open) : undefined;
  const burndown = open ? await getBurndown(open.budget.id) : null;

  return (
    <>
      <PageHeader title="Budgets" subtitle={`${budgets.length - over} on track, ${over} over`} primaryAction={launcher} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {budgets.map((p) => (
          <BudgetCard key={p.budget.id} progress={p} catalog={cat} currentYear={currentYear} />
        ))}
        {open && burndown ? (
          burndown.ok ? (
            <BurndownSection name={open.budget.name} series={burndown.data} today={today} currentYear={currentYear} />
          ) : (
            <div className="lg:col-span-2">
              <ErrorState message={burndown.message} />
            </div>
          )
        ) : null}
      </div>
    </>
  );
}
