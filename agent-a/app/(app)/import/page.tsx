import { loadAccounts } from '../../lib/loaders';
import { ErrorState } from '../../ui/ErrorState';
import { PageHeader } from '../../ui/PageHeader';
import { ImportWizard } from './ImportWizard';

export const dynamic = 'force-dynamic';

/** How do I bring in a statement, and what happened to it? (01-S02, 05-S06) */
export default async function ImportPage() {
  const accounts = await loadAccounts();
  return (
    <>
      <PageHeader title="Import a statement" subtitle="BAC Credomatic and Banco Nacional statements in CSV" />
      {accounts.ok ? <ImportWizard accounts={accounts.data} /> : <ErrorState message={accounts.message} />}
    </>
  );
}
