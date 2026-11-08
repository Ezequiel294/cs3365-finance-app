"use client";

import { useState } from "react";
import type { Account, DuplicatePair } from "@finance/shared";
import { dismissDuplicate, mergeDuplicate } from "@/actions/review-actions";
import { originalWithUsd, shortDate } from "@/lib/format";

/** 01-S04: two records that may be one purchase. Nothing is merged without the user's choice. */
export function DuplicatePairCard({ pair, accounts }: { pair: DuplicatePair; accounts: Account[] }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const records = [pair.transaction, pair.other].filter((t): t is NonNullable<typeof t> => !!t);
  const act = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setPending(true);
    const r = await fn();
    setPending(false);
    if (!r.ok) setError(r.error ?? "failed");
  };

  return (
    <div className="card">
      <div className="grid">
        {records.map((t, i) => {
          const money = originalWithUsd(t);
          return (
            <div key={t.id}>
              <b>{i === 0 ? "A" : "B"}</b> · {shortDate(t.localDate)} · {accounts.find((a) => a.id === t.accountId)?.name ?? "account"}
              <div className="big" style={{ fontSize: "1.1rem" }}>
                {money.original} <span className="muted small">{money.converted ? `(${money.converted})` : ""}</span>
              </div>
              <div>{t.merchantRaw ?? "No description"}</div>
              <div className="muted small">From: {t.sources.join(", ")}</div>
            </div>
          );
        })}
      </div>
      {error && <p className="error-text">{error}</p>}
      <div className="row" style={{ marginTop: "0.75rem" }}>
        {pair.other && (
          <>
            <button disabled={pending} onClick={() => act(() => mergeDuplicate(pair.transaction.id, pair.other!.id))}>
              Keep A, merge B into it
            </button>
            <button disabled={pending} className="secondary" onClick={() => act(() => mergeDuplicate(pair.other!.id, pair.transaction.id))}>
              Keep B, merge A into it
            </button>
          </>
        )}
        <button disabled={pending} className="secondary" onClick={() => act(() => dismissDuplicate(pair.transaction.id))}>
          Not duplicates, keep both
        </button>
      </div>
    </div>
  );
}
