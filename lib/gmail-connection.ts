import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/crypto";
import {
  gmailClientFor,
  registerWatch,
  stopWatch,
  getMailboxAddress,
  type GmailClient,
} from "@/lib/gmail";

/**
 * Per-user Gmail connection management.
 *
 * A connection stores the user's encrypted refresh token plus watch state.
 * The refresh token is captured at sign-in (auth.ts `signIn` event) once the
 * user grants the gmail.readonly scope. All mailbox access for a user goes
 * through here so tokens are decrypted in exactly one place.
 */

export interface GmailContext {
  userId: string;
  houseId: string | null;
  email: string;
  client: GmailClient;
}

/**
 * Persist (or update) a user's Gmail connection from a fresh refresh token,
 * then register a push watch on their mailbox. Best-effort on the watch — a
 * watch failure must never block sign-in, so callers should not await-throw.
 */
export async function upsertConnectionAndWatch(
  userId: string,
  email: string,
  refreshToken: string
): Promise<void> {
  const refreshTokenEnc = encrypt(refreshToken);

  await prisma.gmailConnection.upsert({
    where: { userId },
    create: { userId, email, refreshTokenEnc },
    update: { email, refreshTokenEnc },
  });

  // Register the watch so Gmail pushes this mailbox's changes to Pub/Sub.
  try {
    const client = gmailClientFor(refreshToken);
    const { historyId, expiration } = await registerWatch(client);
    await prisma.gmailConnection.update({
      where: { userId },
      data: { historyId, watchExpiresAt: expiration },
    });
  } catch (err) {
    // Non-fatal: the connection still exists; the renewal cron / manual sync
    // can register the watch later. Log for visibility.
    console.error(`[gmail-connection] watch registration failed for ${email}:`, (err as Error).message);
  }
}

/** Build an authenticated client for a user, or null if they haven't connected. */
export async function getUserGmailClient(userId: string): Promise<GmailClient | null> {
  const conn = await prisma.gmailConnection.findUnique({ where: { userId } });
  if (!conn) return null;
  return gmailClientFor(decrypt(conn.refreshTokenEnc));
}

/**
 * Resolve everything the webhook needs from an inbound Pub/Sub emailAddress:
 * the owning user, their active house, and an authenticated client. Returns
 * null if no connected user owns that mailbox.
 */
export async function resolveGmailContext(email: string): Promise<GmailContext | null> {
  const conn = await prisma.gmailConnection.findUnique({
    where: { email },
    include: { user: { select: { id: true, activeHouseId: true } } },
  });
  if (!conn) return null;

  return {
    userId: conn.user.id,
    houseId: conn.user.activeHouseId,
    email: conn.email,
    client: gmailClientFor(decrypt(conn.refreshTokenEnc)),
  };
}

/** Mark that a successful sync just ran (for "last synced" UI). */
export async function markSynced(userId: string): Promise<void> {
  await prisma.gmailConnection
    .update({ where: { userId }, data: { lastSyncedAt: new Date() } })
    .catch(() => {}); // best-effort
}

/** Tear down a user's connection: stop the watch, delete the stored token. */
export async function disconnect(userId: string): Promise<void> {
  const conn = await prisma.gmailConnection.findUnique({ where: { userId } });
  if (!conn) return;
  try {
    await stopWatch(gmailClientFor(decrypt(conn.refreshTokenEnc)));
  } catch (err) {
    console.error(`[gmail-connection] stopWatch failed for ${conn.email}:`, (err as Error).message);
  }
  await prisma.gmailConnection.delete({ where: { userId } });
}

/** Confirm a connection is live by reading the mailbox address. */
export async function verifyConnection(userId: string): Promise<string | null> {
  const client = await getUserGmailClient(userId);
  if (!client) return null;
  return getMailboxAddress(client);
}
