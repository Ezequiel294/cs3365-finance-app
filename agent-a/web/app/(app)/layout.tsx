import Link from "next/link";
import { redirect } from "next/navigation";
import { signOutAction } from "@/actions/auth-actions";
import { sessionService } from "@/lib/session";

const LINKS = [
  ["/dashboard", "Dashboard"],
  ["/transactions", "Transactions"],
  ["/review", "Review"],
  ["/import", "Import statement"],
  ["/budgets", "Budgets"],
  ["/cashflow", "Money in and out"],
  ["/portfolio", "Portfolio"],
  ["/connections", "Connections"],
  ["/settings", "Settings"],
] as const;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await sessionService.getSession();
  if (!session) redirect("/signin");
  return (
    <div className="shell">
      <nav className="nav" aria-label="Main">
        <Link className="brand" href="/dashboard">
          Finance App
        </Link>
        {LINKS.map(([href, label]) => (
          <Link key={href} href={href}>
            {label}
          </Link>
        ))}
        <div className="spacer" />
        {session.email && <span className="small" style={{ color: "#8fa3bf", padding: "0.4rem 0.6rem" }}>{session.email}</span>}
        <form action={signOutAction}>
          <button type="submit">Sign out</button>
        </form>
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}
