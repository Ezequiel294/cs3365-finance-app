import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { SessionService } from '@/lib/session';
import { signOutAction } from './actions/auth';
import './globals.css';

export const metadata: Metadata = {
  title: 'Finance App',
  description: 'Personal finances in colones and dollars',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = { themeColor: '#12263f', width: 'device-width', initialScale: 1 };

const NAV = [
  ['/dashboard', 'Dashboard'],
  ['/transactions', 'Transactions'],
  ['/review', 'Review'],
  ['/accounts', 'Accounts'],
  ['/import', 'Import'],
  ['/budgets', 'Budgets'],
  ['/cashflow', 'Money in and out'],
  ['/portfolio', 'Portfolio'],
  ['/connections', 'Connections'],
] as const;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await SessionService.getSession();
  return (
    <html lang="en">
      <body>
        <header className="top">
          <Link className="brand" href="/dashboard">
            Finance App
          </Link>
          {session &&
            NAV.map(([href, label]) => (
              <Link key={href} href={href}>
                {label}
              </Link>
            ))}
          {session && (
            <form action={signOutAction}>
              <button type="submit">Sign out</button>
            </form>
          )}
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
