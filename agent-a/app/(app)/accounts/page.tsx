import { loadAccounts } from '../../lib/loaders';
import { DataTable } from '../../ui/DataTable';
import { EmptyState } from '../../ui/EmptyState';
import { ErrorState } from '../../ui/ErrorState';
import { formatIban } from '../../ui/format';
import { PageHeader } from '../../ui/PageHeader';
import { Section } from '../../ui/Section';
import { AccountDialogButton } from './AccountDialog';

export const dynamic = 'force-dynamic';

const BANK_NAME = { BAC: 'BAC Credomatic', BN: 'Banco Nacional' } as const;

/** Which bank accounts and cards does the app know about? (01-S02a) */
export default async function AccountsPage() {
  const accounts = await loadAccounts();
  const header = <PageHeader title="Accounts" primaryAction={<AccountDialogButton account={null} variant="primary" label="Add an account" />} />;
  if (!accounts.ok) return <>{header}<ErrorState message={accounts.message} /></>;
  if (!accounts.data.length) {
    return (
      <>
        {header}
        <EmptyState title="No accounts yet" body="Add the accounts your statements and bank emails come from." />
      </>
    );
  }
  return (
    <>
      {header}
      <Section>
        <DataTable
          caption="Accounts"
          columns={[
            { key: 'name', label: 'Name' },
            { key: 'bank', label: 'Bank' },
            { key: 'currency', label: 'Currency' },
            { key: 'iban', label: 'IBAN' },
            { key: 'cards', label: 'Cards' },
            { key: 'edit', label: '' },
          ]}
          rows={accounts.data.map((a) => ({
            _key: a.id,
            name: a.name,
            bank: BANK_NAME[a.bank],
            currency: a.currency,
            iban: a.iban ? <span className="font-mono text-[13px]">{formatIban(a.iban)}</span> : '—',
            cards: a.cardLast4s.length ? a.cardLast4s.map((c) => `•••• ${c}`).join(', ') : '—',
            edit: <AccountDialogButton account={a} variant="link" label="Edit" />,
          }))}
        />
      </Section>
    </>
  );
}
