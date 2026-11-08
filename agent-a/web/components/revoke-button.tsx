"use client";

import { useState } from "react";
import { revokeConnection } from "@/actions/connection-actions";

/** 06-S02: revoking asks once, explains what changes, and takes effect on the script's next call. */
export function RevokeButton({ connectionId }: { connectionId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!confirming) {
    return (
      <button type="button" className="danger" onClick={() => setConfirming(true)}>
        Revoke
      </button>
    );
  }
  return (
    <div className="banner warn" style={{ margin: 0 }}>
      <span>New bank emails will stop arriving. Imported transactions stay.</span>
      <button
        type="button"
        className="danger"
        onClick={async () => {
          const r = await revokeConnection(connectionId);
          if (!r.ok) setError(r.error);
        }}
      >
        Confirm revoke
      </button>
      <button type="button" className="secondary" onClick={() => setConfirming(false)}>
        Cancel
      </button>
      {error && <span className="error-text">{error}</span>}
    </div>
  );
}
