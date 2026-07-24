import webpush from "web-push";

/**
 * Web Push helper. Configures VAPID once and exposes a thin send wrapper that
 * reports whether a subscription has become invalid (so the caller can prune it).
 */

let configured = false;

function ensureConfigured() {
  if (configured) return;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";
  if (!publicKey || !privateKey) {
    throw new Error("VAPID keys are not configured. See .env.example.");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export type PushResult = "sent" | "expired" | "error";

/**
 * Send a push notification. Returns "expired" if the subscription is gone
 * (HTTP 404/410) and should be deleted from the DB.
 */
export async function sendPush(
  target: PushTarget,
  payload: PushPayload
): Promise<PushResult> {
  ensureConfigured();
  try {
    await webpush.sendNotification(
      {
        endpoint: target.endpoint,
        keys: { p256dh: target.p256dh, auth: target.auth },
      },
      JSON.stringify(payload)
    );
    return "sent";
  } catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return "expired";
    console.error("[push] send failed:", (err as Error).message);
    return "error";
  }
}
