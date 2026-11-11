import type { Account } from '@finance/shared';
import { AccountsManager } from '@/components/accounts-manager';
import { load } from '@/lib/analytics-loader';
import { safe } from '@/lib/page-data';

export const dynamic = 'force-dynamic';

/** AccountsPage (01-S02a): register accounts with bank, currency, IBAN, and cards. */
export default async function AccountsPage() {
  const { data, error } = await safe(load<Account[]>('/api/accounts', '/accounts'));
  return (
    <>
      <h1>Accounts</h1>
      {error && <p className="error">{error}</p>}
      <AccountsManager accounts={data ?? []} />
    </>
  );
}
