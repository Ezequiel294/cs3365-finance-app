import { loadAccounts, loadCatalog, loadReview, loadToday } from '../../lib/loaders';
import { EmptyState } from '../../ui/EmptyState';
import { ErrorState } from '../../ui/ErrorState';
import { PageHeader } from '../../ui/PageHeader';
import { Tabs } from '../../ui/Tabs';
import { ReviewInbox, type ReviewTab } from './ReviewInbox';

export const dynamic = 'force-dynamic';

/** What needs a decision from me? (02-S06, 01-S04, 01-S08c) */
export default async function ReviewPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const [review, catalog, accounts, { timeZone, currentYear }] = await Promise.all([loadReview(), loadCatalog(), loadAccounts(), loadToday()]);
  if (!review.ok) return <><PageHeader title="Review" /><ErrorState message={review.message} /></>;
  const list = review.data;
  if (list.count === 0) {
    return (
      <>
        <PageHeader title="Review" />
        <EmptyState title="All caught up" body="Transactions that need a category, look like duplicates, or could not be read will appear here." />
      </>
    );
  }
  const counts: Record<ReviewTab, number> = {
    categorize: list.uncategorized.length,
    duplicates: list.duplicates.length,
    emails: list.unparsed.length,
  };
  const requested = params.tab as ReviewTab | undefined;
  const tab: ReviewTab =
    requested && requested in counts ? requested : ((['categorize', 'duplicates', 'emails'] as ReviewTab[]).find((t) => counts[t] > 0) ?? 'categorize');
  return (
    <>
      <PageHeader
        title="Review"
        tabs={
          <Tabs
            current={tab}
            items={[
              { id: 'categorize', label: `To categorize (${counts.categorize})`, href: '/review?tab=categorize' },
              { id: 'duplicates', label: `Possible duplicates (${counts.duplicates})`, href: '/review?tab=duplicates' },
              { id: 'emails', label: `Emails not understood (${counts.emails})`, href: '/review?tab=emails' },
            ]}
          />
        }
      />
      <ReviewInbox
        key={tab}
        tab={tab}
        list={list}
        catalog={catalog.ok ? catalog.data : { categories: [], tags: [] }}
        accounts={accounts.ok ? accounts.data : []}
        timeZone={timeZone}
        currentYear={currentYear}
      />
    </>
  );
}
