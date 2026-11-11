'use client';

import { formatMinor, type Account, type ImportJob } from '@finance/shared';
import { useEffect, useState } from 'react';
import { getImport, startImport } from '@/app/actions/imports';

const MAX_BYTES = 1024 * 1024;

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function Summary({ job, currency }: { job: ImportJob; currency: Account['currency'] }) {
  if (job.status === 'FAILED') return <p className="error">Import failed: {job.failureReason}</p>;
  if (job.status !== 'DONE') return <p className="muted">Status: {job.status.toLowerCase()}…</p>;
  const c = job.checksum;
  return (
    <div>
      <p className="ok">Import finished.</p>
      <ul>
        <li>{job.imported} imported, of which {job.transfers} are transfers between your own accounts</li>
        <li>{job.merged} merged with transactions that arrived by email</li>
        <li>{job.skipped} skipped because they were already imported</li>
        <li>{job.rowErrors.length} rows could not be read</li>
      </ul>
      {job.rowErrors.length > 0 && (
        <table>
          <tbody>
            {job.rowErrors.map((e) => (
              <tr key={e.line}>
                <td>Line {e.line}</td>
                <td>{e.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {c &&
        (c.ok ? (
          <p className="ok">
            Totals match the bank&apos;s: out {formatMinor(c.actualOutMinor, currency)}, in {formatMinor(c.actualInMinor, currency)}.
          </p>
        ) : (
          <p className="warn">
            Totals do not match the bank&apos;s: read out {formatMinor(c.actualOutMinor, currency)} vs printed {formatMinor(c.expectedOutMinor, currency)}, in{' '}
            {formatMinor(c.actualInMinor, currency)} vs {formatMinor(c.expectedInMinor, currency)}. A row may have been skipped or misread.
          </p>
        ))}
    </div>
  );
}

export function ImportForm({ accounts }: { accounts: Account[] }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importId, setImportId] = useState<string | null>(null);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [busy, setBusy] = useState(false);
  const account = accounts.find((a) => a.id === accountId);

  useEffect(() => {
    if (!importId) return;
    let stop = false;
    const tick = async () => {
      const r = await getImport(importId);
      if (stop) return;
      if (r.ok) setJob(r.data);
      if (!r.ok || r.data.status === 'DONE' || r.data.status === 'FAILED') return;
      setTimeout(tick, 2000);
    };
    tick();
    return () => {
      stop = true;
    };
  }, [importId]);

  async function upload() {
    setError(null);
    setJob(null);
    setImportId(null);
    if (!file || !accountId) return setError('Pick an account and a file.');
    if (file.size > MAX_BYTES) return setError('The file is larger than 1 MiB.');
    if (file.size === 0) return setError('The file is empty.');
    setBusy(true);
    try {
      const sha = await sha256Hex(file);
      const start = await startImport(accountId, file.name, sha, file.size);
      if (!start.ok) {
        const previous = start.details?.importId as string | undefined;
        setError(start.status === 409 ? 'This file was already imported.' : start.error);
        if (previous) setImportId(previous);
        return;
      }
      const form = new FormData();
      for (const [k, v] of Object.entries(start.data.upload.fields)) form.append(k, v);
      form.append('file', file);
      const res = await fetch(start.data.upload.url, { method: 'POST', body: form });
      if (!res.ok) return setError(`The upload failed (HTTP ${res.status}). Try again.`);
      setImportId(start.data.importId);
    } finally {
      setBusy(false);
    }
  }

  if (accounts.length === 0) {
    return (
      <div className="card">
        <p className="muted">
          Add the account first on the <a href="/accounts">Accounts</a> page.
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="row">
        <div>
          <label htmlFor="account">Account</label>
          <select id="account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.bank}, {a.currency})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="file">Statement file (.csv)</label>
          <input id="file" type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
        <button type="button" onClick={upload} disabled={busy} style={{ flex: '0 0 auto' }}>
          {busy ? 'Uploading…' : 'Import'}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {job && account && <Summary job={job} currency={account.currency} />}
    </div>
  );
}
