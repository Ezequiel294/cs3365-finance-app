import Link from 'next/link';
import type { ReactNode } from 'react';

/** One headline number: label, 28 px value, optional Delta, optional caption. */
export function StatTile({
  label,
  value,
  delta,
  caption,
  href,
  small = false,
}: {
  label: string;
  value: ReactNode;
  delta?: ReactNode;
  caption?: ReactNode;
  href?: string;
  small?: boolean;
}) {
  const body = (
    <div className="flex h-full flex-col gap-1 rounded-[8px] border border-border bg-surface p-4">
      <span className="text-[13px] text-text-secondary">{label}</span>
      <span className={small ? 'text-[20px] leading-tight font-semibold' : 'text-[28px] leading-tight font-semibold'}>{value}</span>
      {delta ? <span className="text-sm">{delta}</span> : null}
      {caption ? <span className="text-[13px] text-text-secondary">{caption}</span> : null}
    </div>
  );
  return href ? (
    <Link href={href} className="block rounded-[8px] hover:shadow-sm">
      {body}
    </Link>
  ) : (
    body
  );
}

/** Tiles sit in a row of 2 on phones and 4 from 1024 px. */
export function StatRow({ children, columns = 4 }: { children: ReactNode; columns?: 3 | 4 }) {
  return (
    <div className={columns === 4 ? 'mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4' : 'mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3'}>
      {children}
    </div>
  );
}
