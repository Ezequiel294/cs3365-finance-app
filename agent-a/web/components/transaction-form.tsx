"use client";

import { useState } from "react";
import { parseDecimalToMinor, type Account, type Category, type Currency, type Tag, type TransactionKind } from "@finance/shared";
import { createTransaction } from "@/actions/transaction-actions";

const KINDS: { value: TransactionKind; label: string }[] = [
  { value: "purchase", label: "Purchase" },
  { value: "refund", label: "Refund" },
  { value: "sinpe_sent", label: "SINPE sent" },
  { value: "sinpe_received", label: "SINPE received" },
  { value: "transfer", label: "Transfer between my accounts" },
  { value: "card_payment", label: "Card payment" },
];

/** 01-S03 and 01-S05: amount and date are the only required entries; date defaults to today, currency to the account's. */
export function TransactionForm({ accounts, categories, tags, today }: { accounts: Account[]; categories: Category[]; tags: Tag[]; today: string }) {
  const [direction, setDirection] = useState<"out" | "in">("out");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const account = accounts.find((a) => a.id === accountId);
  const [currency, setCurrency] = useState<Currency | "">("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  if (accounts.length === 0) {
    return (
      <p className="muted">
        Add an account in <a href="/settings">Settings</a> first.
      </p>
    );
  }

  async function submit(form: FormData) {
    const amountMinor = parseDecimalToMinor(String(form.get("amount") ?? ""));
    if (!amountMinor) return setMessage({ ok: false, text: "Enter an amount such as 14000 or 27.40" });
    setPending(true);
    const result = await createTransaction({
      accountId,
      kind: direction === "in" ? "income" : String(form.get("kind") ?? "purchase"),
      amountMinor,
      currency: currency || account?.currency,
      localDate: String(form.get("localDate") || today),
      merchantRaw: String(form.get("merchant") ?? "").trim() || undefined,
      categoryId: String(form.get("categoryId") ?? "") || undefined,
      tagIds: selectedTags,
      note: String(form.get("note") ?? "").trim() || undefined,
    });
    setPending(false);
    if (result.ok) {
      setMessage({ ok: true, text: result.data.status === "pending_review" ? "Saved. It is waiting in the review inbox for a category." : "Saved." });
      setSelectedTags([]);
      (document.getElementById("txn-form") as HTMLFormElement | null)?.reset();
    } else {
      setMessage({ ok: false, text: result.status === 503 ? `${result.error}` : result.error });
    }
  }

  return (
    <form id="txn-form" action={submit} className="card">
      <div className="segmented" style={{ marginBottom: "0.75rem" }}>
        <button type="button" className={direction === "out" ? "on" : ""} onClick={() => setDirection("out")}>
          Money out
        </button>
        <button type="button" className={direction === "in" ? "on" : ""} onClick={() => setDirection("in")}>
          Money in
        </button>
      </div>
      <div className="grid">
        <label>
          Account
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.currency})
              </option>
            ))}
          </select>
        </label>
        <label>
          Amount
          <input name="amount" inputMode="decimal" placeholder="14000" required autoFocus />
        </label>
        <label>
          Currency
          <select value={currency || account?.currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
            <option value="CRC">CRC (₡)</option>
            <option value="USD">USD ($)</option>
          </select>
        </label>
        <label>
          {direction === "in" ? "Date the money arrived" : "Date"}
          <input name="localDate" type="date" defaultValue={today} max="2100-12-31" />
        </label>
        {direction === "out" && (
          <label>
            Kind
            <select name="kind" defaultValue="purchase">
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          {direction === "in" ? "From (client, employer)" : "Merchant"}
          <input name="merchant" placeholder={direction === "in" ? "ACME client" : "Optional"} />
        </label>
        <label>
          Category
          <select name="categoryId" defaultValue="">
            <option value="">Decide later</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Note
          <input name="note" placeholder="Optional" />
        </label>
      </div>
      {tags.length > 0 && (
        <div style={{ marginTop: "0.75rem" }}>
          <span className="muted small">Tags: </span>
          {tags.map((t) => {
            const on = selectedTags.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                className={`pill ${on ? "on" : ""}`}
                style={{ border: 0, color: "inherit" }}
                onClick={() => setSelectedTags(on ? selectedTags.filter((x) => x !== t.id) : [...selectedTags, t.id])}
              >
                {on ? "✓ " : ""}
                {t.name}
              </button>
            );
          })}
        </div>
      )}
      <div className="row" style={{ marginTop: "0.75rem" }}>
        <button disabled={pending}>{pending ? "Saving…" : direction === "in" ? "Record money in" : "Add transaction"}</button>
        {message && <span className={message.ok ? "ok-text" : "error-text"}>{message.text}</span>}
      </div>
    </form>
  );
}
