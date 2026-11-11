'use client';

import type { ConnectionView, GmailSetup } from '@finance/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { connectGmail, revokeConnection, rotateGmail } from '@/app/actions/connections';

function when(iso?: string | null): string {
  if (!iso) return 'never';
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Costa_Rica' });
}

function Setup({ setup }: { setup: GmailSetup }) {
  return (
    <div className="card">
      <h2>Set up the Gmail script</h2>
      <p className="warn">This token is shown only once. Copy it now.</p>
      <label>Ingest token</label>
      <input readOnly value={setup.token} onFocus={(e) => e.target.select()} />
      <ol>
        <li>Open script.google.com, create a project, and paste the script below into Code.gs.</li>
        <li>Project Settings → Script properties → add <code>INGEST_TOKEN</code> with the token above.</li>
        <li>Select the <code>setup</code> function and click Run. Approve the Gmail permissions.</li>
      </ol>
      <pre>{setup.script}</pre>
    </div>
  );
}

export function ConnectionsPanel({ connections }: { connections: ConnectionView[] }) {
  const router = useRouter();
  const [setup, setSetup] = useState<GmailSetup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const active = connections.filter((c) => c.connection.status !== 'REVOKED');

  async function run<T>(fn: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>, onOk?: (d: T) => void) {
    setBusy(true);
    setError(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onOk?.(r.data);
    router.refresh();
  }

  function revoke(id: string) {
    if (!window.confirm('New bank emails will stop arriving. Imported transactions stay. Revoke?')) return;
    run(() => revokeConnection(id));
  }

  return (
    <>
      {error && <p className="error">{error}</p>}
      {connections.map(({ connection: c, stale, lastSevenDays: s }) => (
        <div key={c.id} className="card">
          {stale && <div className="banner warn">Your Gmail connection stopped on {when(c.lastSeenAt)}. Reconnect?</div>}
          <h2>Gmail script</h2>
          <p>
            Status: <strong>{c.status === 'ACTIVE' ? (stale ? 'stopped' : 'working') : c.status.toLowerCase()}</strong> · token{' '}
            <code>{c.tokenPrefix}…</code> · last seen {when(c.lastSeenAt)}
          </p>
          <p className="muted">Can read: BAC and Banco Nacional card alert emails that the script forwards. Nothing else.</p>
          <p>
            Last 7 days: {s.imported} imported, {s.unparsed} not understood, {s.rejected} rejected, {s.duplicate} already known
          </p>
          {c.status !== 'REVOKED' && (
            <div className="row">
              <button type="button" className="secondary" disabled={busy} onClick={() => run(() => rotateGmail(c.id), setSetup)}>
                {stale ? 'Reconnect (new token)' : 'New token'}
              </button>
              <button type="button" className="danger" disabled={busy} onClick={() => revoke(c.id)}>
                Revoke
              </button>
            </div>
          )}
        </div>
      ))}
      {active.length === 0 && (
        <div className="card">
          <p>Connect Gmail to have BAC and Banco Nacional card alerts arrive automatically.</p>
          <button type="button" disabled={busy} onClick={() => run(connectGmail, setSetup)}>
            Connect Gmail
          </button>
        </div>
      )}
      {setup && <Setup setup={setup} />}
    </>
  );
}
