import type { Account, Category, ReviewList, Tag } from '@finance/shared';
import { ReviewInbox } from '@/components/review-inbox';
import { load } from '@/lib/analytics-loader';
import { safe } from '@/lib/page-data';

export const dynamic = 'force-dynamic';

/** ReviewPage (01-S04, 01-S08c, 02-S06): uncategorized, possible duplicates, emails not understood. */
export default async function ReviewPage() {
  const [review, categories, tags, accounts] = await Promise.all([
    safe(load<ReviewList>('/api/review', '/review')),
    safe(load<Category[]>('/api/categories', '/review')),
    safe(load<Tag[]>('/api/tags', '/review')),
    safe(load<Account[]>('/api/accounts', '/review')),
  ]);
  return (
    <>
      <h1>Review inbox</h1>
      {review.error && <p className="error">{review.error}</p>}
      {review.data && (
        <ReviewInbox review={review.data} categories={categories.data ?? []} tags={tags.data ?? []} accounts={accounts.data ?? []} />
      )}
    </>
  );
}
