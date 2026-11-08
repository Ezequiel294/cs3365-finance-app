import type { Connection } from "@finance/shared";
import { shortDate } from "@/lib/format";
import { ReconnectButton } from "./gmail-setup";

/** 01-S09: a Gmail connection without a heartbeat for 24 hours is shown as stopped, with reconnect in the notice. */
export function StaleConnectionBanner({ connections }: { connections: Connection[] }) {
  const stale = connections.filter((c) => c.stale);
  if (stale.length === 0) return null;
  return (
    <>
      {stale.map((c) => (
        <div key={c.id} className="banner warn" role="status">
          <span>
            Your Gmail connection stopped on {c.lastSeenAt ? shortDate(c.lastSeenAt.slice(0, 10)) : "an unknown date"}. Totals may be missing bank emails since then. Reconnect?
          </span>
          <ReconnectButton connectionId={c.id} />
        </div>
      ))}
    </>
  );
}
