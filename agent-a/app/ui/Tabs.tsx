import Link from 'next/link';
import { cx } from './format';

export interface TabItem {
  label: string;
  href: string;
  id: string;
}

/** Views of one page. Links, not buttons: the current tab is in the URL and works without JavaScript. */
export function Tabs({ items, current }: { items: TabItem[]; current: string }) {
  return (
    <nav aria-label="Views" className="flex flex-wrap gap-1 border-b border-border">
      {items.map((t) => {
        const active = t.id === current;
        return (
          <Link
            key={t.id}
            href={t.href}
            aria-current={active ? 'page' : undefined}
            className={cx(
              '-mb-px inline-flex min-h-11 items-center border-b-2 px-3 text-sm sm:min-h-9',
              active ? 'border-accent font-semibold text-text' : 'border-transparent text-text-secondary hover:text-text',
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
