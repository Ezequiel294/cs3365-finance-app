import type { Account } from '@finance/shared';
import { ImportForm } from '@/components/import-form';
import { load } from '@/lib/analytics-loader';
import { safe } from '@/lib/page-data';

export const dynamic = 'force-dynamic';

/** ImportPage (01-S02, 05-S06): upload a BAC or Banco Nacional statement. */
export default async function ImportPage() {
  const { data, error } = await safe(load<Account[]>('/api/accounts', '/import'));
  return (
    <>
      <h1>Import a statement</h1>
      {error && <p className="error">{error}</p>}
      <p className="muted">
        Supported: BAC Credomatic &ldquo;Transacciones del mes&rdquo; and Banco Nacional &ldquo;Consulta de saldos&rdquo; CSV exports, up to 1 MiB.
        The file goes straight to private storage; amounts keep the statement&apos;s currency.
      </p>
      <ImportForm accounts={data ?? []} />
    </>
  );
}
