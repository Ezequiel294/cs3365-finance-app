import { cx } from './format';

/** A category, tag, or type on a row: a small pill, neutral by default. */
export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'warning' | 'accent' }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[13px] leading-5 whitespace-nowrap',
        tone === 'neutral' && 'border-border bg-page text-text',
        tone === 'warning' && 'border-warning bg-[#fff6e0] text-text',
        tone === 'accent' && 'border-accent text-accent',
      )}
    >
      {label}
    </span>
  );
}

export type Status = 'good' | 'neutral' | 'critical' | 'warning';

const ICONS: Record<Status, { icon: string; color: string }> = {
  good: { icon: '●', color: 'text-good' },
  neutral: { icon: '◔', color: 'text-text-secondary' },
  critical: { icon: '▲', color: 'text-critical' },
  warning: { icon: '◷', color: 'text-warning' },
};

/** A state: icon, label, and tone together (● Working, ◔ Waiting, ▲ Stopped, ◷ Older price). */
export function StatusBadge({ status, label }: { status: Status; label: string }) {
  const s = ICONS[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-sm whitespace-nowrap">
      <span aria-hidden="true" className={s.color}>
        {s.icon}
      </span>
      <span>{label}</span>
    </span>
  );
}
