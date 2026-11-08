"use client";

import { useState } from "react";
import { WEEK_DAYS, type UserSettings } from "@finance/shared";
import { createAccount, createLabel, saveSettings } from "@/actions/setup-actions";

function useMessage() {
  return useState<{ ok: boolean; text: string } | null>(null);
}

export function AccountForm() {
  const [message, setMessage] = useMessage();
  async function submit(form: FormData) {
    const r = await createAccount({
      name: String(form.get("name") ?? ""),
      bank: String(form.get("bank") ?? ""),
      type: String(form.get("type") ?? "checking"),
      currency: String(form.get("currency") ?? "CRC"),
      last4: String(form.get("last4") ?? "").trim() || undefined,
    });
    setMessage(r.ok ? { ok: true, text: `Added ${r.data.name}.` } : { ok: false, text: r.error });
  }
  return (
    <form action={submit}>
      <div className="grid">
        <label>
          Name
          <input name="name" required placeholder="BAC colones card" />
        </label>
        <label>
          Bank
          <input name="bank" required placeholder="BAC" />
        </label>
        <label>
          Type
          <select name="type">
            <option value="checking">Checking</option>
            <option value="savings">Savings</option>
            <option value="credit_card">Credit card</option>
            <option value="cash">Cash</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>
          Currency
          <select name="currency">
            <option value="CRC">CRC (₡)</option>
            <option value="USD">USD ($)</option>
          </select>
        </label>
        <label>
          Last 4 digits (matches bank emails)
          <input name="last4" inputMode="numeric" pattern="\d{4}" maxLength={4} placeholder="1234" />
        </label>
      </div>
      <div className="row" style={{ marginTop: "0.75rem" }}>
        <button>Add account</button>
        {message && <span className={message.ok ? "ok-text" : "error-text"}>{message.text}</span>}
      </div>
    </form>
  );
}

export function LabelForm({ kind }: { kind: "category" | "tag" }) {
  const [message, setMessage] = useMessage();
  async function submit(form: FormData) {
    const r = await createLabel(kind, String(form.get("name") ?? ""));
    setMessage(r.ok ? { ok: true, text: `Added ${r.data.name}.` } : { ok: false, text: r.error });
  }
  return (
    <form action={submit} className="row">
      <input name="name" required placeholder={kind === "category" ? "New category" : "New tag"} aria-label={`New ${kind} name`} />
      <button className="secondary">Add {kind}</button>
      {message && <span className={message.ok ? "ok-text small" : "error-text"}>{message.text}</span>}
    </form>
  );
}

export function SettingsForm({ settings }: { settings: UserSettings }) {
  const [message, setMessage] = useMessage();
  async function submit(form: FormData) {
    const r = await saveSettings({ timeZone: String(form.get("timeZone") ?? ""), weekStart: String(form.get("weekStart") ?? "MONDAY") });
    setMessage(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error });
  }
  return (
    <form action={submit} className="row">
      <label>
        Time zone
        <input name="timeZone" defaultValue={settings.timeZone} />
      </label>
      <label>
        Weeks start on
        <select name="weekStart" defaultValue={settings.weekStart}>
          {WEEK_DAYS.map((d) => (
            <option key={d} value={d}>
              {d.charAt(0) + d.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
      </label>
      <button className="secondary">Save</button>
      {message && <span className={message.ok ? "ok-text small" : "error-text"}>{message.text}</span>}
    </form>
  );
}
