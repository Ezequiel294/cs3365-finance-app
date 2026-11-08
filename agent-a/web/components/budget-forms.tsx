"use client";

import { useState } from "react";
import { BUDGET_PERIODS, parseDecimalToMinor, type Budget, type BudgetPeriod, type Category, type Tag } from "@finance/shared";
import { createBudget, updateBudget } from "@/actions/budget-actions";

const PERIOD_LABEL: Record<BudgetPeriod, string> = {
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  YEARLY: "Yearly",
  CUSTOM: "Custom dates",
};

function MultiPick({ items, value, onChange, label }: { items: { id: string; name: string }[]; value: string[]; onChange: (v: string[]) => void; label: string }) {
  return (
    <div>
      <div className="muted small">{label}</div>
      {items.map((i) => {
        const on = value.includes(i.id);
        return (
          <button
            key={i.id}
            type="button"
            className={`pill ${on ? "on" : ""}`}
            style={{ border: 0, color: "inherit", cursor: "pointer" }}
            onClick={() => onChange(on ? value.filter((x) => x !== i.id) : [...value, i.id])}
          >
            {on ? "✓ " : ""}
            {i.name}
          </button>
        );
      })}
    </div>
  );
}

/** 03-S02 and 03-S10: a limit on categories and/or tags, over a week, month, quarter, year, or custom range. */
export function NewBudgetForm({ categories, tags }: { categories: Category[]; tags: Tag[] }) {
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [period, setPeriod] = useState<BudgetPeriod>("MONTHLY");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(form: FormData) {
    const limitCents = parseDecimalToMinor(String(form.get("limit") ?? ""));
    if (!limitCents) return setMessage({ ok: false, text: "Enter the limit in dollars, such as 300" });
    const r = await createBudget({
      name: String(form.get("name") ?? ""),
      categoryIds,
      tagIds,
      period,
      limitCents,
      startDate: period === "CUSTOM" ? String(form.get("startDate") ?? "") || undefined : undefined,
      endDate: period === "CUSTOM" ? String(form.get("endDate") ?? "") || undefined : undefined,
    });
    if (r.ok) {
      setMessage({ ok: true, text: `Created "${r.data.name}", with its history filled in from past transactions.` });
      setCategoryIds([]);
      setTagIds([]);
    } else setMessage({ ok: false, text: r.error });
  }

  return (
    <form action={submit} className="card">
      <h3>New budget</h3>
      <div className="grid">
        <label>
          Name
          <input name="name" required placeholder="University" />
        </label>
        <label>
          Limit (USD)
          <input name="limit" inputMode="decimal" required placeholder="300" />
        </label>
        <label>
          Period
          <select value={period} onChange={(e) => setPeriod(e.target.value as BudgetPeriod)}>
            {BUDGET_PERIODS.map((p) => (
              <option key={p} value={p}>
                {PERIOD_LABEL[p]}
              </option>
            ))}
          </select>
        </label>
        {period === "CUSTOM" && (
          <>
            <label>
              From
              <input name="startDate" type="date" required />
            </label>
            <label>
              To
              <input name="endDate" type="date" required />
            </label>
          </>
        )}
      </div>
      <p className="muted small">A transaction counts when its category is one of these (or none are chosen) and it has any of these tags (or none are chosen).</p>
      <MultiPick label="Categories" items={categories} value={categoryIds} onChange={setCategoryIds} />
      <MultiPick label="Tags" items={tags} value={tagIds} onChange={setTagIds} />
      <div className="row" style={{ marginTop: "0.75rem" }}>
        <button>Create budget</button>
        {message && <span className={message.ok ? "ok-text" : "error-text"}>{message.text}</span>}
      </div>
    </form>
  );
}

/** Change a budget's period (03-S10) or limit. The version guards against overwriting a change made elsewhere. */
export function EditBudget({ budget }: { budget: Budget }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function save(changes: Record<string, unknown>) {
    setPending(true);
    setError(null);
    const r = await updateBudget(budget.id, { ...changes, version: budget.version });
    setPending(false);
    if (!r.ok) setError(r.status === 409 ? "This budget changed meanwhile. Reload the page." : r.error);
  }
  return (
    <div className="row small">
      <select aria-label="Period" disabled={pending} value={budget.period} onChange={(e) => save({ period: e.target.value })}>
        {BUDGET_PERIODS.filter((p) => p !== "CUSTOM" || budget.period === "CUSTOM").map((p) => (
          <option key={p} value={p}>
            {PERIOD_LABEL[p]}
          </option>
        ))}
      </select>
      <input
        aria-label="Limit in USD"
        style={{ width: "7rem" }}
        defaultValue={(budget.limitCents / 100).toFixed(2)}
        disabled={pending}
        onBlur={(e) => {
          const cents = parseDecimalToMinor(e.target.value);
          if (cents && cents !== budget.limitCents) save({ limitCents: cents });
        }}
      />
      {error && <span className="error-text">{error}</span>}
    </div>
  );
}
