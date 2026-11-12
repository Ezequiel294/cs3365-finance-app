import type { ReactNode } from 'react';

/** Detail that is not needed at first glance: a native <details>. */
export function Disclosure({ summary, children, open = false }: { summary: string; children: ReactNode; open?: boolean }) {
  return (
    <details className="text-sm" open={open}>
      <summary className="py-1 text-accent">{summary}</summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}
