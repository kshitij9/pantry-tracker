import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind-aware className combiner (Shadcn convention). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type ExpiryState = "critical" | "soon" | "fresh" | "expired";

/**
 * Classify how urgent an item's expiry is, relative to `now`.
 *  - expired : already past expiry
 *  - critical: <= 48 hours remaining
 *  - soon    : 3-5 days remaining
 *  - fresh   : > 5 days remaining
 */
export function expiryState(expiresAt: Date | string, now: Date = new Date()): ExpiryState {
  const expiry = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
  const hoursLeft = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (hoursLeft < 0) return "expired";
  if (hoursLeft <= 48) return "critical";
  if (hoursLeft <= 24 * 5) return "soon";
  return "fresh";
}

/** Human-friendly "in 3 days" / "2 days ago" style label. */
export function relativeExpiry(expiresAt: Date | string, now: Date = new Date()): string {
  const expiry = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
  const msLeft = expiry.getTime() - now.getTime();
  const dayMs = 1000 * 60 * 60 * 24;
  const days = Math.round(msLeft / dayMs);

  if (msLeft < 0) {
    const overdue = Math.abs(days);
    return overdue === 0 ? "Expired today" : `Expired ${overdue}d ago`;
  }
  if (days === 0) return "Expires today";
  if (days === 1) return "Expires tomorrow";
  return `Expires in ${days}d`;
}
