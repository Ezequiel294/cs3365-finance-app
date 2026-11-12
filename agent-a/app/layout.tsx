import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Finance App',
  description: 'Where your money goes, in USD and colones.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#f9f9f7' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-page text-text antialiased">{children}</body>
    </html>
  );
}
