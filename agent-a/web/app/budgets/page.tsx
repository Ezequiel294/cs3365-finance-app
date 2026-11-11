import type { Budget, BudgetProgress, Category, Tag, UserSettings } from '@finance/shared';
import { BudgetsManager } from '@/components/budgets-manager';
import { load } from '@/lib/analytics-loader';
import { safe } from '@/lib/page-data';

export const dynamic = 'force-dynamic';

/** BudgetsPage (03-S02, 03-S10, 03-S11). */
export default async function BudgetsPage() {
  const [progress, budgets, categories, tags, settings] = await Promise.all([
    safe(load<BudgetProgress[]>('/api/analytics/budgets', '/budgets')),
    safe(load<Budget[]>('/api/budgets', '/budgets')),
    safe(load<Category[]>('/api/categories', '/budgets')),
    safe(load<Tag[]>('/api/tags', '/budgets')),
    safe(load<UserSettings>('/api/settings', '/budgets')),
  ]);
  return (
    <>
      <h1>Budgets</h1>
      {progress.error && <p className="error">{progress.error}</p>}
      <BudgetsManager
        progress={progress.data ?? []}
        budgets={budgets.data ?? []}
        categories={categories.data ?? []}
        tags={tags.data ?? []}
        weekStart={settings.data?.weekStart ?? 'MONDAY'}
      />
    </>
  );
}
