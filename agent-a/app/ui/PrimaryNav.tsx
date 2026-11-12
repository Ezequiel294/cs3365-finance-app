'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { signOutAction } from '../actions/auth-actions';
import { cx } from './format';

export interface NavItem {
  label: string;
  href: string;
  badge?: number;
}

function isCurrent(item: NavItem, path: string): boolean {
  if (item.href === '/dashboard' && path.startsWith('/cashflow')) return true;
  return path === item.href || path.startsWith(`${item.href}/`);
}

/** Primary items in the top bar (a bottom tab bar under 640 px) and the More menu. */
export function PrimaryNav({ primary, more }: { primary: NavItem[]; more: NavItem[] }) {
  const path = usePathname() ?? '';
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  useEffect(() => setOpen(false), [path]);

  const label = (i: NavItem) => (
    <>
      {i.label}
      {i.badge ? (
        <span className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[12px] leading-5 font-semibold text-white" aria-label={`${i.badge} to review`}>
          {i.badge}
        </span>
      ) : null}
    </>
  );

  return (
    <>
      <nav aria-label="Main" className="hidden items-center gap-1 sm:flex">
        {primary.map((i) => {
          const current = isCurrent(i, path);
          return (
            <Link
              key={i.href}
              href={i.href}
              aria-current={current ? 'page' : undefined}
              className={cx('inline-flex h-9 items-center border-b-2 px-2 text-sm', current ? 'border-accent font-semibold' : 'border-transparent text-text-secondary hover:text-text')}
            >
              {label(i)}
            </Link>
          );
        })}
      </nav>
      <div ref={menuRef} className="relative">
        <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="inline-flex h-11 items-center rounded-[6px] px-3 text-sm sm:h-9">
          More ▾
        </button>
        {open ? (
          <div role="menu" className="absolute right-0 z-40 mt-1 w-56 rounded-[8px] border border-border bg-surface py-1 shadow-lg">
            {more.map((i) => (
              <Link
                key={i.href}
                role="menuitem"
                href={i.href}
                aria-current={isCurrent(i, path) ? 'page' : undefined}
                className={cx('block px-4 py-2.5 text-sm hover:bg-page', isCurrent(i, path) && 'font-semibold')}
              >
                {i.label}
              </Link>
            ))}
            <form action={signOutAction}>
              <button type="submit" role="menuitem" className="block w-full px-4 py-2.5 text-left text-sm hover:bg-page">
                Sign out
              </button>
            </form>
          </div>
        ) : null}
      </div>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-surface sm:hidden">
        {primary.map((i) => {
          const current = isCurrent(i, path);
          return (
            <Link
              key={i.href}
              href={i.href}
              aria-current={current ? 'page' : undefined}
              className={cx('flex min-h-14 flex-col items-center justify-center border-t-2 px-1 text-[13px]', current ? 'border-accent font-semibold' : 'border-transparent text-text-secondary')}
            >
              <span className="flex items-center">{label(i)}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
