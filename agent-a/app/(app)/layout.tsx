import Link from 'next/link';
import type { Catalog } from '@/shared/api-types';
import { loadAccounts, loadCatalog, loadConnections, loadReview, loadToday } from '../lib/loaders';
import { SessionService } from '../lib/session';
import { formatDay } from '../ui/format';
import { type NavItem, PrimaryNav } from '../ui/PrimaryNav';
import { OpenQuickAdd, QuickAddTransaction } from '../ui/QuickAddTransaction';
import { ToastProvider } from '../ui/Toast';

export const dynamic = 'force-dynamic';

/** AppShell: one layout for every signed-in route. */
export default async function AppShell({ children }: { children: React.ReactNode }) {
  await SessionService.requireSession();
  const [review, connections, accounts, catalog, { today }] = await Promise.all([
    loadReview(),
    loadConnections(),
    loadAccounts(),
    loadCatalog(),
    loadToday(),
  ]);
  const reviewCount = review.ok ? review.data.count : 0;
  const stale = connections.ok ? connections.data.find((c) => c.stale) : undefined;
  const staleSince = stale?.connection.lastSeenAt ?? stale?.connection.createdAt;
  const emptyCatalog: Catalog = { categories: [], tags: [] };

  const primary: NavItem[] = [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Transactions', href: '/transactions' },
    { label: 'Review', href: '/review', badge: reviewCount || undefined },
    { label: 'Budgets', href: '/budgets' },
    { label: 'Portfolio', href: '/portfolio' },
  ];
  const more: NavItem[] = [
    { label: 'Accounts', href: '/accounts' },
    { label: 'Import a statement', href: '/import' },
    { label: 'Connections', href: '/connections' },
    { label: 'Settings', href: '/settings' },
  ];

  return (
    <ToastProvider>
      <QuickAddTransaction accounts={accounts.ok ? accounts.data : []} catalog={catalog.ok ? catalog.data : emptyCatalog} today={today}>
        <div className="min-h-screen pb-20 sm:pb-0">
          <header className="sticky top-0 z-20 border-b border-border bg-surface">
            <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between gap-3 px-4">
              <Link href="/dashboard" className="text-base font-semibold whitespace-nowrap">
                Finance App
              </Link>
              <div className="flex items-center gap-2">
                <PrimaryNav primary={primary} more={more} />
                <OpenQuickAdd />
              </div>
            </div>
          </header>
          {stale && staleSince ? (
            <div role="status" className="border-b border-warning bg-[#fff6e0]">
              <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
                <span>
                  <span aria-hidden="true" className="text-warning">
                    ◷{' '}
                  </span>
                  Bank emails stopped arriving on {formatDay(staleSince.slice(0, 10), Number(today.slice(0, 4)))}.
                </span>
                <Link href="/connections" className="font-semibold text-accent underline">
                  Reconnect
                </Link>
              </div>
            </div>
          ) : null}
          <main className="mx-auto max-w-[1200px] px-4 py-6">{children}</main>
        </div>
      </QuickAddTransaction>
    </ToastProvider>
  );
}
