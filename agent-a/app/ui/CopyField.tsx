'use client';
import { useId, useState } from 'react';
import { Button } from './Button';

/** A value the user must copy: read-only monospace value with a "Copy" button. */
export function CopyField({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const id = useId();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span id={id} className="text-sm font-medium">
          {label}
        </span>
        <Button onClick={copy} aria-describedby={id}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      {multiline ? (
        <div>
          <pre
            aria-labelledby={id}
            className={`overflow-x-auto rounded-[6px] border border-border bg-page p-3 font-mono text-[13px] whitespace-pre ${showAll ? '' : 'max-h-[11.5em] overflow-y-hidden'}`}
          >
            {value}
          </pre>
          {!showAll ? (
            <button type="button" className="mt-1 text-sm text-accent underline" onClick={() => setShowAll(true)}>
              Show all
            </button>
          ) : null}
        </div>
      ) : (
        <output aria-labelledby={id} className="block rounded-[6px] border border-border bg-page p-3 font-mono text-[13px] break-all">
          {value}
        </output>
      )}
    </div>
  );
}
