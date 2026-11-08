import { listConnections } from "@/actions/connection-actions";
import { ConnectGmailButton, ReconnectButton } from "@/components/gmail-setup";
import { RevokeButton } from "@/components/revoke-button";
import { StaleConnectionBanner } from "@/components/stale-banner";
import { ago } from "@/lib/format";

/** 06-S02 and 01-S08a: everything the product can access, and withdrawing it. */
export default async function ConnectionsPage() {
  const connections = await listConnections();
  if (!connections.ok) return <p className="error-text">{connections.error}</p>;
  const active = connections.data.filter((c) => c.status !== "REVOKED");
  const revoked = connections.data.filter((c) => c.status === "REVOKED");

  return (
    <>
      <h1>Connections</h1>
      <StaleConnectionBanner connections={connections.data} />
      <div className="card">
        <h3>What this app can access</h3>
        <ul>
          <li>Bank alert emails that your own Gmail script sends, and only from the bank senders the app supports. The app never sees your Google or bank password.</li>
          <li>Statement files you upload yourself.</li>
          <li>Nothing else: no bank logins and no connections to your bank.</li>
        </ul>
      </div>

      <h2>Gmail</h2>
      {active.length === 0 && (
        <div className="card">
          <p>Connect Gmail to have bank alert emails become transactions without typing. Import and manual entry keep working without it.</p>
          <ConnectGmailButton />
        </div>
      )}
      {active.map((c) => (
        <div key={c.id} className="card">
          <div className="row between">
            <div>
              <b>Gmail script</b> · {c.stale ? <span className="warn">stopped</span> : c.status === "ACTIVE" ? <span className="good">active</span> : <span className="muted">waiting for setup()</span>}
              <div className="muted small">
                Token starting {c.tokenPrefix}… · last seen {ago(c.lastSeenAt)} · created {c.createdAt.slice(0, 10)}
              </div>
            </div>
            <div className="row">
              <ReconnectButton connectionId={c.id} label="New token" />
              <RevokeButton connectionId={c.id} />
            </div>
          </div>
        </div>
      ))}
      {revoked.length > 0 && (
        <p className="muted small">
          {revoked.length} revoked connection{revoked.length > 1 ? "s" : ""}. Their tokens no longer work.
        </p>
      )}
      {active.length > 0 && (
        <details>
          <summary className="muted">Connect another Gmail account</summary>
          <ConnectGmailButton />
        </details>
      )}
    </>
  );
}
