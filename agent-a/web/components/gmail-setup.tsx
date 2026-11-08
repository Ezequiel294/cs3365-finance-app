"use client";

import { useState } from "react";
import type { GmailSetup } from "@finance/shared";
import { connectGmail, finishSetup, rotateGmail } from "@/actions/connection-actions";

/** Shows the one-time ingest token and the Apps Script with paste-in instructions (01-S08a). */
export function GmailSetupView({ setup, onDone }: { setup: GmailSetup; onDone: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (what: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(what);
  };
  return (
    <div className="card">
      <h3>Finish connecting Gmail</h3>
      <ol>
        <li>
          Open <a href="https://script.google.com" target="_blank" rel="noreferrer">script.google.com</a>, create a project, and paste the script below into <code>Code.gs</code>.
        </li>
        <li>
          In <b>Project Settings → Script properties</b>, add <code>INGEST_TOKEN</code> with the token below. Keep it only there, never in the script.
        </li>
        <li>
          Run <code>setup</code> once and approve the permissions. The log says &quot;Connected&quot;.
        </li>
      </ol>
      <p className="warn">This token is shown only once. If you lose it, reconnect to get a new one.</p>
      <div className="row">
        <input readOnly value={setup.token} style={{ flex: 1, fontFamily: "monospace" }} aria-label="Ingest token" />
        <button type="button" onClick={() => copy("token", setup.token)}>
          {copied === "token" ? "Copied" : "Copy token"}
        </button>
      </div>
      <div className="row between" style={{ marginTop: "0.75rem" }}>
        <b>Apps Script</b>
        <button type="button" className="secondary" onClick={() => copy("script", setup.script)}>
          {copied === "script" ? "Copied" : "Copy script"}
        </button>
      </div>
      <pre>{setup.script}</pre>
      <button
        type="button"
        onClick={async () => {
          onDone();
          await finishSetup();
        }}
      >
        I saved the token
      </button>
    </div>
  );
}

export function ConnectGmailButton() {
  const [setup, setSetup] = useState<GmailSetup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  if (setup) return <GmailSetupView setup={setup} onDone={() => setSetup(null)} />;
  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          const r = await connectGmail();
          setPending(false);
          if (r.ok) setSetup(r.data);
          else setError(r.error);
        }}
      >
        Connect Gmail
      </button>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

export function ReconnectButton({ connectionId, label = "Reconnect" }: { connectionId: string; label?: string }) {
  const [setup, setSetup] = useState<GmailSetup | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (setup) return <GmailSetupView setup={setup} onDone={() => setSetup(null)} />;
  return (
    <>
      <button
        type="button"
        className="secondary"
        onClick={async () => {
          const r = await rotateGmail(connectionId);
          if (r.ok) setSetup(r.data);
          else setError(r.error);
        }}
      >
        {label}
      </button>
      {error && <span className="error-text">{error}</span>}
    </>
  );
}
