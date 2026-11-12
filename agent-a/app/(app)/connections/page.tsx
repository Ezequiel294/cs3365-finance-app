import { loadConnections, loadToday } from '../../lib/loaders';
import { ErrorState } from '../../ui/ErrorState';
import { PageHeader } from '../../ui/PageHeader';
import { ConnectionsView } from './ConnectionsView';

export const dynamic = 'force-dynamic';

/** What can the app access, and is it still working? (06-S02, 01-S08a, 01-S09) */
export default async function ConnectionsPage() {
  const [connections, { timeZone }] = await Promise.all([loadConnections(), loadToday()]);
  const subtitle = 'The only access the app has is the key your Gmail script uses. It never sees your Gmail or bank password.';
  if (!connections.ok) return <><PageHeader title="Connections" subtitle={subtitle} /><ErrorState message={connections.message} /></>;
  return <ConnectionsView views={connections.data} timeZone={timeZone} subtitle={subtitle} />;
}
