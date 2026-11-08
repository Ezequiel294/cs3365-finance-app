import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Finance App",
  description: "Personal finances across banks and currencies",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = { themeColor: "#0f1b2d", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
