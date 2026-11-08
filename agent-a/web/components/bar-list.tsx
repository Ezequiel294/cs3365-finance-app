import { formatUsd } from "@finance/shared";

export interface BarRow {
  key: string;
  label: string;
  amountCents: number;
  /** 0..1 width of the bar. */
  fraction: number;
  right?: string;
  over?: boolean;
}

/** A ranked list that reads without interaction: label, amount, and share in text, the bar only as support. */
export function BarList({ rows, empty }: { rows: BarRow[]; empty: string }) {
  if (rows.length === 0) return <p className="muted">{empty}</p>;
  return (
    <div className="bar-list">
      {rows.map((r) => (
        <div key={r.key} className="bar-item">
          <div className="labels">
            <span>{r.label}</span>
            <span>
              {formatUsd(r.amountCents)}
              {r.right ? <span className="muted"> · {r.right}</span> : null}
            </span>
          </div>
          <div className="bar-track" aria-hidden>
            <div className={`bar-fill${r.over ? " over" : ""}`} style={{ width: `${Math.min(100, Math.max(0, r.fraction * 100))}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
