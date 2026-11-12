'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ConnectionView, GmailSetup } from '@/shared/api-types';
import { connectGmail, revokeConnection, rotateGmail } from '../../actions/connection-actions';
import { type Status, StatusBadge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { CopyField } from '../../ui/CopyField';
import { Disclosure } from '../../ui/Disclosure';
import { EmptyState } from '../../ui/EmptyState';
import { formatDateTime } from '../../ui/format';
import { PageHeader } from '../../ui/PageHeader';
import { Section } from '../../ui/Section';
import { StatTile } from '../../ui/StatTile';
import { useToast } from '../../ui/Toast';

function status(view: ConnectionView): { status: Status; label: string } {
  if (view.stale) return { status: 'critical', label: 'Stopped' };
  if (view.connection.status === 'PENDING') return { status: 'neutral', label: 'Waiting for the first email' };
  return { status: 'good', label: 'Working' };
}

/** Only right after connecting or replacing the key: the key (shown once), three steps, and the script. */
export function GmailSetupPanel({ setup }: { setup: GmailSetup }) {
  return (
    <Section title="Set up the Gmail script">
      <p role="alert" className="rounded-[6px] border border-warning bg-[#fff6e0] px-3 py-2 text-sm">
        <span aria-hidden="true" className="text-warning">◷ </span>
        This key is shown only once. Copy it now.
      </p>
      <CopyField label="Key" value={setup.token} />
      <ol className="flex flex-col gap-1 text-sm">
        <li>1. Open script.google.com, create a project, and paste the script into Code.gs.</li>
        <li>2. In Project Settings, under Script properties, add INGEST_TOKEN with the key above.</li>
        <li>3. Choose the setup function, click Run, and approve the Gmail permissions.</li>
      </ol>
      <CopyField label="Script" value={setup.script} multiline />
    </Section>
  );
}

/** The active connection: status, last email, what it reads, the last 7 days, and its actions. */
export function ConnectionCard({ view, timeZone, onRotate, onRevoke }: { view: ConnectionView; timeZone: string; onRotate: () => void; onRevoke: () => void }) {
  const s = status(view);
  const c = view.connection;
  return (
    <Section title="Gmail">
      <div className="flex flex-col gap-1">
        <StatusBadge status={s.status} label={s.label} />
        <p className="text-sm">{c.lastSeenAt ? `Last email received ${formatDateTime(c.lastSeenAt, timeZone, true)}` : 'No email received yet'}</p>
        <p className="text-sm text-text-secondary">Reads only the BAC and Banco Nacional alert emails your script forwards.</p>
        <p className="text-[13px] text-text-secondary">Key starting {c.tokenPrefix}…</p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile small label="Imported" value={String(view.lastSevenDays.imported)} />
        <StatTile small label="Not understood" value={String(view.lastSevenDays.unparsed)} href="/review?tab=emails" />
        <StatTile small label="Rejected" value={String(view.lastSevenDays.rejected)} />
        <StatTile small label="Already known" value={String(view.lastSevenDays.duplicate)} />
      </div>
      <p className="text-[13px] text-text-secondary">Last 7 days</p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onRotate}>Replace the key</Button>
        <Button variant="destructive" onClick={onRevoke}>
          Disconnect
        </Button>
      </div>
    </Section>
  );
}

export function ConnectionsView({ views, timeZone, subtitle }: { views: ConnectionView[]; timeZone: string; subtitle: string }) {
  const router = useRouter();
  const toast = useToast();
  const [setup, setSetup] = useState<GmailSetup | null>(null);
  const [confirm, setConfirm] = useState<null | 'revoke' | 'rotate'>(null);
  const [pending, setPending] = useState(false);
  const active = views.find((v) => v.connection.status !== 'REVOKED');
  const past = views.filter((v) => v.connection.status === 'REVOKED');

  const connect = async () => {
    setPending(true);
    const r = await connectGmail();
    setPending(false);
    if (!r.ok) return toast.show(r.message, { tone: 'negative' });
    setSetup(r.data);
    router.refresh();
  };
  const rotate = async () => {
    if (!active) return;
    setPending(true);
    const r = await rotateGmail(active.connection.id);
    setPending(false);
    setConfirm(null);
    if (!r.ok) return toast.show(r.message, { tone: 'negative' });
    setSetup(r.data);
    toast.show('The key was replaced. Paste the new one into your script.');
    router.refresh();
  };
  const revoke = async () => {
    if (!active) return;
    setPending(true);
    const r = await revokeConnection(active.connection.id);
    setPending(false);
    setConfirm(null);
    if (!r.ok) return toast.show(r.message, { tone: 'negative' });
    setSetup(null);
    toast.show('Gmail disconnected');
    router.refresh();
  };

  return (
    <>
      <PageHeader
        title="Connections"
        subtitle={subtitle}
        primaryAction={!active ? <Button variant="primary" pending={pending} onClick={connect}>Connect Gmail</Button> : undefined}
      />
      <div className="flex flex-col gap-6">
        {active ? (
          <ConnectionCard view={active} timeZone={timeZone} onRotate={() => setConfirm('rotate')} onRevoke={() => setConfirm('revoke')} />
        ) : !setup ? (
          <EmptyState
            title="Bank emails can file themselves"
            body="A small script in your own Google account forwards your bank's alert emails here. Statements and manual entry work without it."
          />
        ) : null}
        {setup ? <GmailSetupPanel setup={setup} /> : null}
        {past.length ? (
          <Disclosure summary="Past connections">
            <ul className="flex flex-col gap-1">
              {past.map((v) => (
                <li key={v.connection.id} className="text-sm text-text-secondary">
                  Key {v.connection.tokenPrefix}… · {v.connection.lastSeenAt ? `last email ${formatDateTime(v.connection.lastSeenAt, timeZone, true)}` : 'no email received'} · Disconnected
                </li>
              ))}
            </ul>
          </Disclosure>
        ) : null}
      </div>
      <ConfirmDialog
        open={confirm === 'revoke'}
        title="Disconnect Gmail?"
        consequence="New bank emails will stop arriving. Imported transactions stay."
        confirmLabel="Disconnect"
        pending={pending}
        onConfirm={revoke}
        onClose={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'rotate'}
        title="Replace the key?"
        consequence="The current key stops working at once. You will need to paste the new one into your script."
        confirmLabel="Replace the key"
        pending={pending}
        onConfirm={rotate}
        onClose={() => setConfirm(null)}
        destructive={false}
      />
    </>
  );
}
