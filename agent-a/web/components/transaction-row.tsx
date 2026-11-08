"use client";

import { useState } from "react";
import type { Account, Category, Tag, Transaction } from "@finance/shared";
import { saveRule } from "@/actions/review-actions";
import { updateTransaction } from "@/actions/transaction-actions";
import { originalWithUsd, shortDate } from "@/lib/format";

const KIND_LABEL: Record<string, string> = {
  purchase: "",
  refund: "Refund",
  income: "Money in",
  sinpe_sent: "SINPE sent",
  sinpe_received: "SINPE received",
  transfer: "Transfer",
  card_payment: "Card payment",
};

/**
 * One transaction with its category and tags editable in place (02-S02, 02-S06). After a category
 * correction it offers to remember the choice for the merchant (02-S05).
 */
export function TransactionRow({
  txn,
  categories,
  tags,
  accounts,
}: {
  txn: Transaction;
  categories: Category[];
  tags: Tag[];
  accounts?: Account[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [rulePrompt, setRulePrompt] = useState<{ categoryId: string; name: string } | null>(null);
  const [ruleSaved, setRuleSaved] = useState(false);
  const money = originalWithUsd(txn);
  const account = accounts?.find((a) => a.id === txn.accountId);

  async function change(changes: { categoryId?: string | null; tagIds?: string[] }) {
    setPending(true);
    setError(null);
    const r = await updateTransaction(txn.id, changes);
    setPending(false);
    if (!r.ok) return setError(r.error);
    if (changes.categoryId && txn.merchantKey && txn.merchantKey !== "unknown") {
      setRulePrompt({ categoryId: changes.categoryId, name: categories.find((c) => c.id === changes.categoryId)?.name ?? changes.categoryId });
    }
  }

  return (
    <tr>
      <td className="small">{shortDate(txn.localDate)}</td>
      <td>
        <div>{txn.merchantRaw ?? <span className="muted">No description</span>}</div>
        <div className="muted small">
          {[KIND_LABEL[txn.kind], account?.name, txn.sources.join(" + ")].filter(Boolean).join(" · ")}
          {txn.categorizedBy === "rule" || txn.categorizedBy === "global" ? " · filed by rule" : ""}
        </div>
        {rulePrompt && !ruleSaved && (
          <div className="banner info small" style={{ margin: "0.4rem 0 0", padding: "0.4rem 0.6rem" }}>
            Always file {txn.merchantRaw} as {rulePrompt.name}?
            <button
              type="button"
              onClick={async () => {
                const r = await saveRule(txn.merchantKey!, rulePrompt.categoryId, txn.tagIds);
                if (r.ok) setRuleSaved(true);
                else setError(r.error);
              }}
            >
              Yes
            </button>
            <button type="button" className="secondary" onClick={() => setRulePrompt(null)}>
              Only this one
            </button>
          </div>
        )}
        {ruleSaved && <div className="ok-text small">Future charges from this merchant will be filed automatically.</div>}
        {error && <div className="error-text">{error}</div>}
      </td>
      <td className="num">
        <div>{money.original}</div>
        {money.converted && <div className="muted small">({money.converted})</div>}
      </td>
      <td>
        <select
          aria-label="Category"
          disabled={pending}
          value={txn.categoryId ?? ""}
          onChange={(e) => change({ categoryId: e.target.value || null })}
        >
          <option value="">Uncategorized</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <div style={{ marginTop: "0.3rem" }}>
          {tags.map((t) => {
            const on = txn.tagIds.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                disabled={pending}
                className={`pill ${on ? "on" : ""}`}
                style={{ border: 0, color: "inherit", cursor: "pointer" }}
                onClick={() => change({ tagIds: on ? txn.tagIds.filter((x) => x !== t.id) : [...txn.tagIds, t.id] })}
              >
                {on ? "✓ " : "+ "}
                {t.name}
              </button>
            );
          })}
        </div>
      </td>
    </tr>
  );
}
