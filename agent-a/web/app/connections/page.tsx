import type { ConnectionView } from '@finance/shared';
import { ConnectionsPanel } from '@/components/connections-panel';
import { load } from '@/lib/analytics-loader';
import { safe } from '@/lib/page-data';

export const dynamic = 'force-dynamic';

/** ConnectionsPage (01-S08, 01-S09, 06-S02): what the product can access, and revoking it. */
export default async function ConnectionsPage() {
  const { data, error } = await safe(load<ConnectionView[]>('/api/connections', '/connections'));
  return (
    <>
      <h1>Connections</h1>
      <p className="muted">
        The only access the app holds is the Gmail script&apos;s ingest token. It never sees your Gmail or bank password. CSV import and
        manual entry work without any connection.
      </p>
      {error && <p className="error">{error}</p>}
      <ConnectionsPanel connections={data ?? []} />
    </>
  );
}
