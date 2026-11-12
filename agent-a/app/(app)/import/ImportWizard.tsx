'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { MAX_IMPORT_BYTES } from '@/shared/schemas';
import type { Account, ImportJob } from '@/shared/types';
import { getImport, startImport } from '../../actions/import-actions';
import { StatusBadge } from '../../ui/Badge';
import { Button, ButtonLink } from '../../ui/Button';
import { DataTable } from '../../ui/DataTable';
import { EmptyState } from '../../ui/EmptyState';
import { formatMoney } from '../../ui/format';
import { FormField, inputClass } from '../../ui/FormField';
import { Section } from '../../ui/Section';
import { StatTile } from '../../ui/StatTile';
import { Stepper } from '../../ui/Stepper';

const HELP = {
  BAC: "In BAC online banking, open the account and download 'Transacciones del mes' as CSV.",
  BN: "In BN online banking, open 'Consulta de saldos' for the account and download it as CSV.",
} as const;

/** SHA-256 of the file in the browser (crypto.subtle). */
async function hashFile(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function checksumDetail(job: ImportJob): string {
  const c = job.checksum;
  if (!c) return '';
  const parts: string[] = [];
  if (c.expectedOutMinor !== c.actualOutMinor) parts.push(`money out ${formatMoney(c.actualOutMinor)} read, ${formatMoney(c.expectedOutMinor)} printed`);
  if (c.expectedInMinor !== c.actualInMinor) parts.push(`money in ${formatMoney(c.actualInMinor)} read, ${formatMoney(c.expectedInMinor)} printed`);
  if (c.expectedOutCount !== undefined && c.expectedOutCount !== c.actualOutCount) parts.push(`${c.actualOutCount} of ${c.expectedOutCount} debits read`);
  if (c.expectedInCount !== undefined && c.expectedInCount !== c.actualInCount) parts.push(`${c.actualInCount} of ${c.expectedInCount} credits read`);
  return parts.join('; ');
}

/** Account → file → result (01-S02). The browser uploads straight to S3 with the presigned form. */
export function ImportWizard({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [already, setAlready] = useState<string | null>(null);
  const [job, setJob] = useState<ImportJob | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  if (!accounts.length) {
    return (
      <EmptyState
        title="Add an account first"
        body="A statement is imported into one of your accounts, so the app knows its bank and currency."
        actions={<ButtonLink href="/accounts" variant="primary">Go to Accounts</ButtonLink>}
      />
    );
  }
  const account = accounts.find((a) => a.id === accountId)!;

  const poll = (id: string) => {
    const tick = async () => {
      const r = await getImport(id);
      if (r.ok && (r.data.status === 'DONE' || r.data.status === 'FAILED')) {
        setJob(r.data);
        setProgress(null);
        setStep(2);
        router.refresh();
        return;
      }
      timer.current = setTimeout(tick, 2000);
    };
    timer.current = setTimeout(tick, 2000);
  };

  const upload = async (file: File) => {
    setError(null);
    setAlready(null);
    if (file.size > MAX_IMPORT_BYTES) return setError('The file is larger than 1 MB. Choose the CSV export of one month.');
    if (file.size === 0) return setError('The file is empty.');
    setProgress('Uploading…');
    const sha = await hashFile(file);
    const start = await startImport(accountId, file.name, sha, file.size);
    if (!start.ok) {
      setProgress(null);
      if (start.code === 'ALREADY_IMPORTED') {
        setAlready((start.details?.importId as string | undefined) ?? '');
        return;
      }
      return setError(start.fields?.size ?? start.message);
    }
    const form = new FormData();
    for (const [k, v] of Object.entries(start.data.upload.fields)) form.append(k, v);
    form.append('file', file);
    const res = await fetch(start.data.upload.url, { method: 'POST', body: form }).catch(() => null);
    if (!res || !res.ok) {
      setProgress(null);
      return setError('The upload did not finish. Check your connection and try again.');
    }
    setProgress('Reading the statement…');
    poll(start.data.importId);
  };

  const showResult = async (id: string) => {
    const r = await getImport(id);
    if (r.ok) {
      setJob(r.data);
      setStep(2);
    }
  };

  const reset = () => {
    setJob(null);
    setStep(0);
    setError(null);
    setAlready(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <Section>
      <Stepper steps={['Account', 'File', 'Result']} current={step} />
      {step === 0 ? (
        <div className="flex max-w-md flex-col gap-4">
          <FormField label="Account">
            {({ id }) => (
              <select id={id} className={inputClass} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <div>
            <Button variant="primary" onClick={() => setStep(1)}>
              Next
            </Button>
          </div>
        </div>
      ) : null}
      {step === 1 ? (
        <div className="flex max-w-xl flex-col gap-4">
          <p className="text-sm">{HELP[account.bank]}</p>
          <FormField label="Statement file" hint="CSV file, up to 1 MB. Amounts keep the statement's currency.">
            {({ id, describedBy }) => (
              <label
                htmlFor={id}
                className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-[8px] border-2 border-dashed border-border bg-page p-4 text-sm"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files[0];
                  if (f) void upload(f);
                }}
              >
                <span>Drop the CSV here, or choose it</span>
                <input
                  ref={fileRef}
                  id={id}
                  type="file"
                  accept=".csv,text/csv"
                  className="text-sm"
                  aria-describedby={describedBy}
                  disabled={Boolean(progress)}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void upload(f);
                  }}
                />
              </label>
            )}
          </FormField>
          {progress ? <p role="status" className="text-sm">{progress}</p> : null}
          {error ? <p role="alert" className="text-sm text-negative">{error}</p> : null}
          {already !== null ? (
            <p role="alert" className="text-sm">
              This file was already imported.{' '}
              {already ? (
                <button type="button" className="text-accent underline" onClick={() => showResult(already)}>
                  See that import&apos;s result
                </button>
              ) : null}
            </p>
          ) : null}
          <div>
            <Button onClick={() => setStep(0)} disabled={Boolean(progress)}>
              Back
            </Button>
          </div>
        </div>
      ) : null}
      {step === 2 && job ? (
        job.status === 'FAILED' ? (
          <div className="flex flex-col gap-3">
            <p role="alert" className="text-sm">The statement could not be read: {job.failureReason} Nothing was imported.</p>
            <div>
              <Button variant="primary" onClick={reset}>
                Choose another file
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile label="Imported" value={String(job.imported)} small />
              <StatTile label="Between your accounts" value={String(job.transfers)} small />
              <StatTile label="Merged with existing" value={String(job.merged)} small />
              <StatTile label="Already imported" value={String(job.skipped)} small />
            </div>
            {job.checksum ? (
              job.checksum.ok ? (
                <StatusBadge status="good" label="Totals match the statement" />
              ) : (
                <StatusBadge status="warning" label={`Totals do not match the statement: ${checksumDetail(job)}`} />
              )
            ) : null}
            {job.rowErrors.length ? (
              <div>
                <h3 className="mb-2 text-base font-semibold">Rows that could not be read</h3>
                <DataTable
                  caption="Rows that could not be read"
                  columns={[
                    { key: 'line', label: 'Line', align: 'right' },
                    { key: 'reason', label: 'Reason' },
                  ]}
                  rows={job.rowErrors.map((e) => ({ _key: String(e.line), line: e.line, reason: e.reason }))}
                />
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Link href="/transactions" className="inline-flex h-11 items-center rounded-[6px] bg-accent px-4 text-sm font-medium text-white sm:h-9">
                See the transactions
              </Link>
              <Button onClick={reset}>Import another</Button>
            </div>
          </div>
        )
      ) : null}
    </Section>
  );
}
