import { expiryState, relativeExpiry, cn } from "@/lib/utils";

/**
 * Color-coded expiry badge.
 *   Critical (<=48h)  -> red
 *   Soon (3-5 days)   -> yellow
 *   Fresh (>5 days)   -> green
 *   Expired           -> dark red
 */
export function ExpiryBadge({ expiresAt }: { expiresAt: string | Date }) {
  const state = expiryState(expiresAt);
  const label = relativeExpiry(expiresAt);

  const styles: Record<string, string> = {
    critical: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-950 dark:text-red-300 dark:ring-red-900",
    soon: "bg-yellow-50 text-yellow-800 ring-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:ring-yellow-900",
    fresh: "bg-green-50 text-green-700 ring-green-200 dark:bg-green-950 dark:text-green-300 dark:ring-green-900",
    expired: "bg-neutral-800 text-red-200 ring-red-900",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        styles[state]
      )}
    >
      {label}
    </span>
  );
}
