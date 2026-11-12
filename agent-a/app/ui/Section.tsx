import type { ReactNode } from 'react';
import { cx } from './format';

/** A titled card: white surface, 1 px border, 8 px radius, 24 px padding, an h2. Never nested. */
export function Section({
  title,
  description,
  action,
  children,
  wide = false,
  className,
}: {
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  wide?: boolean;
  className?: string;
}) {
  return (
    <section className={cx('rounded-[8px] border border-border bg-surface p-6', wide && 'lg:col-span-2', className)}>
      {title || action ? (
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          {title ? <h2 className="text-[20px] leading-tight font-semibold">{title}</h2> : <span />}
          {action}
        </div>
      ) : null}
      {description ? <p className="-mt-2 mb-4 text-sm text-text-secondary">{description}</p> : null}
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

/** Sections sit on a 2-column grid from 1024 px, one column below it. */
export function SectionGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">{children}</div>;
}
