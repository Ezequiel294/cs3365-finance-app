"use client";

import { useState } from "react";
import type { Account, ImportJob } from "@finance/shared";
import { getImport, startImport } from "@/actions/import-actions";

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 01-S02: hash the file in the browser, ask for a presigned form, upload straight to S3, then poll
 * the import every 2 seconds until it is DONE or FAILED.
 */
export function ImportUploader({ accounts }: { accounts: Account[] }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setJob(null);
    try {
      setStatus("Reading the file…");
      const hash = await sha256Hex(file);
      const start = await startImport(accountId, file.name, hash);
      if (!start.ok) throw new Error(start.status === 409 ? "This file was already imported." : start.error);
      if (file.size > start.data.maxBytes) throw new Error("The file is larger than 1 MB.");

      setStatus("Uploading…");
      const form = new FormData();
      for (const [k, v] of Object.entries(start.data.upload.fields)) form.append(k, v);
      form.append("file", file);
      const upload = await fetch(start.data.upload.url, { method: "POST", body: form });
      if (!upload.ok) throw new Error(`The upload was refused (HTTP ${upload.status}).`);

      setStatus("Importing…");
      for (let i = 0; i < 150; i++) {
        await sleep(2000);
        const r = await getImport(start.data.importId);
        if (!r.ok) throw new Error(r.error);
        if (r.data.status === "DONE" || r.data.status === "FAILED") {
          setJob(r.data);
          setStatus(null);
          return;
        }
      }
      throw new Error("The import is taking longer than expected. Check back in a minute.");
    } catch (e) {
      setError((e as Error).message);
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  if (accounts.length === 0) {
    return (
      <p className="muted">
        Add the account the statement belongs to in <a href="/settings">Settings</a> first.
      </p>
    );
  }

  return (
    <>
      <div className="card">
        <div className="grid">
          <label>
            Account
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.bank}, {a.currency})
                </option>
              ))}
            </select>
          </label>
          <label>
            Statement file (CSV, up to 1 MB)
            <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
        </div>
        <div className="row" style={{ marginTop: "0.75rem" }}>
          <button type="button" disabled={!file || busy} onClick={run}>
            Import
          </button>
          {status && <span className="muted">{status}</span>}
          {error && <span className="error-text">{error}</span>}
        </div>
      </div>
      {job && <ImportSummary job={job} />}
    </>
  );
}

function ImportSummary({ job }: { job: ImportJob }) {
  if (job.status === "FAILED") {
    return (
      <div className="banner error">
        The import failed: {job.failureReason ?? "unknown reason"}. Nothing from this file was saved.
      </div>
    );
  }
  return (
    <div className="card">
      <h3>Import finished</h3>
      <p>
        {job.imported} imported · {job.merged} merged with transactions already received by email · {job.skipped} already imported before
      </p>
      {job.rowErrors.length > 0 ? (
        <>
          <p className="warn">{job.rowErrors.length} rows could not be read. The rest of the file was imported.</p>
          <table>
            <thead>
              <tr>
                <th>Row</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {job.rowErrors.map((e) => (
                <tr key={e.row}>
                  <td>{e.row}</td>
                  <td>{e.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p className="ok-text">Every row was read.</p>
      )}
    </div>
  );
}
