import type { ReactNode } from 'react';

/** Top of every page: one h1, optional subtitle, optional Tabs or MonthPicker, at most one primary action. */
export function PageHeader({
  title,
  subtitle,
  tabs,
  monthPicker,
  primaryAction,
}: {
  title: string;
  subtitle?: ReactNode;
  tabs?: ReactNode;
  monthPicker?: ReactNode;
  primaryAction?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[24px] leading-tight font-semibold">{title}</h1>
          {subtitle ? <div className="mt-1 text-sm text-text-secondary">{subtitle}</div> : null}
        </div>
        {primaryAction ? <div className="shrink-0">{primaryAction}</div> : null}
      </div>
      {tabs || monthPicker ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {tabs ?? <span />}
          {monthPicker}
        </div>
      ) : null}
    </header>
  );
}
