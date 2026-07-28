import { gmail, auth as googleAuth } from "@googleapis/gmail";

/**
 * Gmail API helpers: per-user OAuth2 client construction + message retrieval.
 *
 * Each user connects their own mailbox at sign-in (gmail.readonly scope), and
 * their refresh token is stored encrypted (see lib/gmail-connection.ts). All
 * read/watch operations take the caller-supplied client so the app acts on the
 * correct user's mailbox — there is no longer a single shared env mailbox.
 */

// Grocery vendor domains only. Note: Swiggy *Instamart* (groceries) sends from
// `instamart.in`, whereas Swiggy *Food* (restaurant) sends from `swiggy.in` —
// we intentionally do NOT include swiggy.in, so restaurant orders are never
// fetched into this grocery pantry.
const KNOWN_VENDOR_DOMAINS = ["instamart.in", "blinkit.com", "zepto.co", "zeptonow.com"];

export type Platform = "instamart" | "blinkit" | "zepto";

/** The Gmail API client type (v1), for threading through helper signatures. */
export type GmailClient = ReturnType<typeof gmail>;

/**
 * Build an authenticated Gmail client for a specific user's refresh token.
 * The app's OAuth *client* credentials come from env; the *user* token is
 * passed in (decrypted from their GmailConnection).
 */
export function gmailClientFor(refreshToken: string): GmailClient {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Missing GMAIL_CLIENT_ID/GMAIL_CLIENT_SECRET. See .env.example.");
  }

  const oauth2Client = new googleAuth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return gmail({ version: "v1", auth: oauth2Client });
}

/** The Pub/Sub topic Gmail publishes mailbox changes to. */
function watchTopicName(): string {
  const projectId = process.env.GCP_PROJECT_ID;
  const topic = process.env.PUBSUB_TOPIC || "gmail-orders";
  if (!projectId) throw new Error("GCP_PROJECT_ID is not set. See .env.example.");
  return `projects/${projectId}/topics/${topic}`;
}

/** Register (or refresh) a push watch on the user's INBOX. */
export async function registerWatch(
  client: GmailClient
): Promise<{ historyId: string | null; expiration: Date | null }> {
  const res = await client.users.watch({
    userId: "me",
    requestBody: {
      topicName: watchTopicName(),
      labelIds: ["INBOX"],
      labelFilterBehavior: "INCLUDE",
    },
  });
  return {
    historyId: res.data.historyId ?? null,
    expiration: res.data.expiration ? new Date(Number(res.data.expiration)) : null,
  };
}

/** Stop push notifications for the user's mailbox (on disconnect). */
export async function stopWatch(client: GmailClient): Promise<void> {
  await client.users.stop({ userId: "me" });
}

/** Return the address of the connected mailbox (confirms the token works). */
export async function getMailboxAddress(client: GmailClient): Promise<string | null> {
  const res = await client.users.getProfile({ userId: "me" });
  return res.data.emailAddress ?? null;
}

/**
 * Map a sender domain / vendor string to our internal platform enum.
 * Swiggy Instamart (groceries) mails come from `noreply@instamart.in`.
 * Plain `swiggy.in` is Swiggy Food (restaurant) — deliberately NOT matched,
 * so restaurant orders resolve to null and are skipped as unknown-vendor.
 */
export function resolvePlatform(from: string): Platform | null {
  const lower = from.toLowerCase();
  if (lower.includes("instamart")) return "instamart";
  if (lower.includes("blinkit")) return "blinkit";
  if (lower.includes("zepto")) return "zepto";
  return null;
}

/** A header lookup helper for the Gmail message payload. */
function getHeader(
  headers: Array<{ name?: string | null; value?: string | null }> | undefined,
  name: string
): string {
  const h = headers?.find((x) => x.name?.toLowerCase() === name.toLowerCase());
  return h?.value ?? "";
}

/** Recursively collect and decode the text/HTML body from a message payload. */
function extractBody(payload: any): string {
  if (!payload) return "";

  // Simple, non-multipart message.
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  // Multipart: prefer text/html, fall back to text/plain.
  const parts: any[] = payload.parts ?? [];
  const html = parts.find((p) => p.mimeType === "text/html");
  if (html?.body?.data) return decodeBase64Url(html.body.data);

  const plain = parts.find((p) => p.mimeType === "text/plain");
  if (plain?.body?.data) return decodeBase64Url(plain.body.data);

  // Nested multipart (e.g. multipart/alternative inside multipart/mixed).
  for (const part of parts) {
    const nested = extractBody(part);
    if (nested) return nested;
  }
  return "";
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

export interface FetchedMessage {
  messageId: string;
  from: string;
  subject: string;
  date: string;
  body: string;
  platform: Platform | null;
}

/** Fetch a single message by id and return its decoded body + metadata. */
export async function fetchMessage(
  client: GmailClient,
  messageId: string
): Promise<FetchedMessage> {
  const res = await client.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });

  const payload = res.data.payload;
  const headers = payload?.headers ?? undefined;
  const from = getHeader(headers, "From");

  return {
    messageId,
    from,
    subject: getHeader(headers, "Subject"),
    date: getHeader(headers, "Date"),
    body: extractBody(payload),
    platform: resolvePlatform(from),
  };
}

/**
 * Find the most recent order emails from known grocery vendors.
 * Used by the webhook to resolve which message(s) triggered a notification
 * when only a historyId is supplied.
 */
export async function findRecentOrderMessageIds(
  client: GmailClient,
  maxResults = 5,
  days = 7
): Promise<string[]> {
  const query = KNOWN_VENDOR_DOMAINS.map((d) => `from:${d}`).join(" OR ");

  const res = await client.users.messages.list({
    userId: "me",
    q: `(${query}) newer_than:${days}d`,
    maxResults,
  });

  return (res.data.messages ?? []).map((m) => m.id!).filter(Boolean);
}
