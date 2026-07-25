import { gmail, auth as googleAuth } from "@googleapis/gmail";

/**
 * Gmail API helpers: OAuth2 client construction + message retrieval.
 *
 * We use a long-lived refresh token (obtained once via the OAuth consent flow)
 * so the server can read the user's mailbox without interactive login.
 * Required scope: https://www.googleapis.com/auth/gmail.readonly
 */

const KNOWN_VENDOR_DOMAINS = ["swiggy.in", "blinkit.com", "zepto.co", "zeptonow.com"];

export type Platform = "instamart" | "blinkit" | "zepto";

/** Build an authenticated Gmail client from env credentials. */
export function getGmailClient() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Missing Gmail OAuth env vars (GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN). See .env.example."
    );
  }

  const oauth2Client = new googleAuth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  return gmail({ version: "v1", auth: oauth2Client });
}

/**
 * Map a sender domain / vendor string to our internal platform enum.
 * Swiggy Instamart order mails come from swiggy.in.
 */
export function resolvePlatform(from: string): Platform | null {
  const lower = from.toLowerCase();
  if (lower.includes("swiggy.in") || lower.includes("instamart")) return "instamart";
  if (lower.includes("blinkit.com") || lower.includes("blinkit")) return "blinkit";
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
export async function fetchMessage(messageId: string): Promise<FetchedMessage> {
  const client = getGmailClient();
  const userId = process.env.GMAIL_USER_ID || "me";

  const res = await client.users.messages.get({
    userId,
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
  maxResults = 5,
  days = 7
): Promise<string[]> {
  const client = getGmailClient();
  const userId = process.env.GMAIL_USER_ID || "me";

  const query = KNOWN_VENDOR_DOMAINS.map((d) => `from:${d}`).join(" OR ");

  const res = await client.users.messages.list({
    userId,
    q: `(${query}) newer_than:${days}d`,
    maxResults,
  });

  return (res.data.messages ?? []).map((m) => m.id!).filter(Boolean);
}
