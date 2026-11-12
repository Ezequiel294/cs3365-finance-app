import type { ReactNode } from 'react';

/** A page or section with no data: what is missing, what fills it, and one or two actions. */
export function EmptyState({ title, body, actions }: { title: string; body: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-[8px] border border-border bg-surface p-6">
      <h2 className="text-[20px] font-semibold">{title}</h2>
      <p className="max-w-prose text-sm text-text-secondary">{body}</p>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

/** The empty state inside a section (no own card). */
export function SectionEmpty({ title, body, actions }: { title: string; body: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2">
      <p className="font-medium">{title}</p>
      <p className="text-sm text-text-secondary">{body}</p>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
