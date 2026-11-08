"use client";

import { useState } from "react";
import {
  formatQuantity,
  formatUsd,
  parseDecimalToMinor,
  parseQuantityToMicro,
  type Broker,
  type InvestmentTransaction,
  type InvestmentType,
} from "@finance/shared";
import { correctInvestment, recordInvestment, updateBroker } from "@/actions/investment-actions";

const cents = (form: FormData, name: string) => {
  const raw = String(form.get(name) ?? "").trim();
  return raw === "" ? 0 : parseDecimalToMinor(raw);
};

/** 07-S01 and 07-S04: deposits, withdrawals, buys, and sells, each with the commission actually charged. */
export function InvestmentForm({ brokers, today }: { brokers: Broker[]; today: string }) {
  const [type, setType] = useState<InvestmentType>("BUY");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const trade = type === "BUY" || type === "SELL";
  if (brokers.length === 0) return <p className="muted">Add a broker below first.</p>;

  async function submit(form: FormData) {
    const commissionCents = cents(form, "commission");
    const value = cents(form, "value");
    if (value === null || commissionCents === null || !value) return setMessage({ ok: false, text: "Enter amounts in dollars, such as 1450.00" });
    const quantityMicro = trade ? parseQuantityToMicro(String(form.get("quantity") ?? "")) : undefined;
    if (trade && !quantityMicro) return setMessage({ ok: false, text: "Enter the units, up to 6 decimals" });
    const r = await recordInvestment({
      brokerId: String(form.get("brokerId")),
      type,
      localDate: String(form.get("localDate") || today),
      ticker: trade ? String(form.get("ticker") ?? "") : undefined,
      quantityMicro,
      grossCents: trade ? value : undefined,
      amountCents: trade ? undefined : value,
      commissionCents,
      name: String(form.get("name") ?? "").trim() || undefined,
    });
    if (!r.ok) return setMessage({ ok: false, text: r.error });
    const h = r.data.holding;
    setMessage({
      ok: true,
      text: h && h.quantityMicro > 0
        ? `${h.ticker} cost basis now ${formatUsd(h.costBasisCents)} for ${formatQuantity(h.quantityMicro)} units (${formatUsd(Math.round((h.costBasisCents * 1_000_000) / h.quantityMicro))} per unit, commissions included).`
        : "Saved.",
    });
  }

  return (
    <form action={submit} className="card">
      <h3>Record an investment transaction</h3>
      <div className="segmented" style={{ marginBottom: "0.75rem" }}>
        {(["DEPOSIT", "BUY", "SELL", "WITHDRAWAL"] as InvestmentType[]).map((t) => (
          <button key={t} type="button" className={type === t ? "on" : ""} onClick={() => setType(t)}>
            {t.charAt(0) + t.slice(1).toLowerCase()}
          </button>
        ))}
      </div>
      <div className="grid">
        <label>
          Broker
          <select name="brokerId">
            {brokers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Date
          <input name="localDate" type="date" defaultValue={today} />
        </label>
        {trade && (
          <>
            <label>
              Ticker
              <input name="ticker" required placeholder="VOO or BTC/USD" />
            </label>
            <label>
              Units
              <input name="quantity" inputMode="decimal" required placeholder="3.215" />
            </label>
          </>
        )}
        <label>
          {trade ? "Gross trade value (USD)" : type === "DEPOSIT" ? "Amount sent (USD)" : "Amount taken out (USD)"}
          <input name="value" inputMode="decimal" required placeholder="1450.00" />
        </label>
        <label>
          Commission charged (USD)
          <input name="commission" inputMode="decimal" placeholder="0.15" />
        </label>
        <label>
          Name (optional)
          <input name="name" placeholder="Vanguard S&P 500 ETF" />
        </label>
      </div>
      <div className="row" style={{ marginTop: "0.75rem" }}>
        <button>Save</button>
        {message && <span className={message.ok ? "ok-text" : "error-text"}>{message.text}</span>}
      </div>
    </form>
  );
}

/** 07-S03: one commission rule per broker (flat cents and/or basis points), used to estimate selling costs. */
export function BrokerForm({ broker }: { broker?: Broker }) {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  async function submit(form: FormData) {
    const flatCents = cents(form, "flat");
    const pct = String(form.get("percent") ?? "0").trim() || "0";
    const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(pct);
    if (flatCents === null || !m) return setMessage({ ok: false, text: "Use a dollar amount and a percentage with up to 2 decimals" });
    const percentBps = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
    const name = String(form.get("name") ?? "").trim();
    const id = broker?.id ?? `brk-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30)}`;
    const r = await updateBroker(id, { name: name || undefined, flatCents, percentBps, version: broker?.version ?? 0 });
    if (r.ok) setMessage({ ok: true, text: "Saved. Past transactions keep the commissions you entered." });
    else setMessage({ ok: false, text: r.status === 409 ? "This broker changed meanwhile, or the name is taken. Reload the page." : r.error });
  }
  return (
    <form action={submit} className="row" style={{ marginBottom: "0.5rem" }}>
      <label>
        Broker
        <input name="name" defaultValue={broker?.name} required={!broker} readOnly={!!broker} placeholder="Schwab" />
      </label>
      <label>
        Flat fee per sale (USD)
        <input name="flat" inputMode="decimal" defaultValue={broker ? (broker.flatCents / 100).toFixed(2) : "0.00"} style={{ width: "8rem" }} />
      </label>
      <label>
        Plus % of value
        <input name="percent" inputMode="decimal" defaultValue={broker ? (broker.percentBps / 100).toString() : "0"} style={{ width: "6rem" }} />
      </label>
      <button className={broker ? "secondary" : ""}>{broker ? "Update" : "Add broker"}</button>
      {message && <span className={message.ok ? "ok-text small" : "error-text"}>{message.text}</span>}
    </form>
  );
}

/** 07-S01: correct a past trade; the holding is rebuilt from every trade of that ticker. */
export function CorrectInvestment({ tx }: { tx: InvestmentTransaction }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trade = tx.type === "BUY" || tx.type === "SELL";
  if (!open) {
    return (
      <button type="button" className="secondary" onClick={() => setOpen(true)}>
        Correct
      </button>
    );
  }
  async function submit(form: FormData) {
    const changes: Record<string, unknown> = { version: tx.version };
    if (trade) {
      const q = parseQuantityToMicro(String(form.get("quantity") ?? ""));
      if (!q) return setError("Enter the units");
      changes.quantityMicro = q;
      changes.grossCents = cents(form, "value");
    } else {
      changes.amountCents = cents(form, "value");
    }
    changes.commissionCents = cents(form, "commission");
    const r = await correctInvestment(tx.id, changes);
    if (r.ok) setOpen(false);
    else setError(r.status === 409 ? `${r.error}` : r.error);
  }
  return (
    <form action={submit} className="row small">
      {trade && <input name="quantity" defaultValue={formatQuantity(tx.quantityMicro ?? 0)} aria-label="Units" style={{ width: "7rem" }} />}
      <input name="value" defaultValue={(((trade ? tx.grossCents : tx.amountCents) ?? 0) / 100).toFixed(2)} aria-label="Amount" style={{ width: "7rem" }} />
      <input name="commission" defaultValue={(tx.commissionCents / 100).toFixed(2)} aria-label="Commission" style={{ width: "5rem" }} />
      <button>Save</button>
      <button type="button" className="secondary" onClick={() => setOpen(false)}>
        Cancel
      </button>
      {error && <span className="error-text">{error}</span>}
    </form>
  );
}
