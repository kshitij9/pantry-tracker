"use client";

import { useEffect, useState } from "react";
import { Mail, CheckCircle2, AlertTriangle } from "lucide-react";

interface Status {
  connected: boolean;
  email?: string;
  lastSyncedAt?: string | null;
  watchActive?: boolean;
}

/** Compact pill showing whether the user's Gmail is connected for auto-sync. */
export function GmailStatus() {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    fetch("/api/gmail/status", { cache: "no-store" })
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  if (!status) return null;

  if (!status.connected) {
    return (
      <span
        title="Sign out and back in to grant Gmail access for order auto-sync."
        className="flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
      >
        <AlertTriangle className="h-3.5 w-3.5" /> Gmail not connected
      </span>
    );
  }

  const synced = status.lastSyncedAt
    ? `Last synced ${new Date(status.lastSyncedAt).toLocaleDateString()}`
    : "Connected — no sync yet";

  return (
    <span
      title={`${status.email} · ${synced}${status.watchActive ? "" : " · watch inactive"}`}
      className="flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
    >
      {status.watchActive ? (
        <CheckCircle2 className="h-3.5 w-3.5" />
      ) : (
        <Mail className="h-3.5 w-3.5" />
      )}
      Gmail connected
    </span>
  );
}
