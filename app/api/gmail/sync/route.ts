import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveHouseContext } from "@/lib/auth-helpers";
import {
  getUserGmailClient,
  resolveGmailContext,
  markSynced,
} from "@/lib/gmail-connection";
import {
  fetchMessage,
  findRecentOrderMessageIds,
  resolvePlatform,
  type GmailClient,
} from "@/lib/gmail";
import { extractOrderFromEmail } from "@/lib/gemini";
import { computeExpiresAt } from "@/lib/categories";
import { addOrMergeItems } from "@/lib/pantry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/gmail/sync
 *
 * Manually scan and process recent order emails from the caller's own mailbox.
 * Useful when a watch lapsed or to force-process without waiting for a push.
 *
 * Auth (either works):
 *   - Logged-in session: scans the session user's connected mailbox.
 *   - CRON_SECRET via Bearer header or ?token= plus body.email: scans that
 *     connected user's mailbox (for testing/backfill).
 *
 * Body (optional): { days?: number (default 7), email?: string (cron mode only) }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const days = Math.min(Number(body?.days ?? 7), 30);

  // Resolve the target mailbox owner + an authenticated client.
  let userId: string;
  let houseId: string;
  let client: GmailClient;

  const session = await resolveHouseContext();
  if (session.ok) {
    // Authenticated dashboard user — their own mailbox.
    const c = await getUserGmailClient(session.ctx.userId);
    if (!c) {
      return NextResponse.json(
        { error: "Gmail isn't connected for your account. Sign out and sign in again to grant mailbox access." },
        { status: 400 }
      );
    }
    userId = session.ctx.userId;
    houseId = session.ctx.houseId;
    client = c;
  } else {
    // Cron/curl fallback: CRON_SECRET + a target email.
    const secret = process.env.CRON_SECRET;
    const authHeader = req.headers.get("authorization");
    const token = req.nextUrl.searchParams.get("token");
    if (!secret || (authHeader !== `Bearer ${secret}` && token !== secret)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const email = body?.email as string | undefined;
    const ctx = email ? await resolveGmailContext(email) : null;
    if (!ctx || !ctx.houseId) {
      return NextResponse.json(
        { error: "No connected mailbox with an active house for that email." },
        { status: 404 }
      );
    }
    userId = ctx.userId;
    houseId = ctx.houseId;
    client = ctx.client;
  }

  const messageIds = await findRecentOrderMessageIds(client, 20, days);

  const results: Array<{
    messageId: string;
    status: string;
    created?: number;
    merged?: number;
  }> = [];

  let rateLimited = false;

  for (const messageId of messageIds) {
    try {
      const already = await prisma.orderLog.findUnique({ where: { messageId } });
      if (already) {
        results.push({ messageId, status: "skipped:already-processed" });
        continue;
      }

      const message = await fetchMessage(client, messageId);
      const platform = message.platform ?? resolvePlatform(message.from);

      if (!platform) {
        results.push({ messageId, status: "skipped:unknown-vendor" });
        continue;
      }

      const parsed = await extractOrderFromEmail(message.body);

      if (parsed.order_type !== "grocery") {
        await prisma.orderLog.create({ data: { userId, houseId, messageId, platform } });
        results.push({ messageId, status: `skipped:${parsed.order_type}` });
        continue;
      }

      const purchasedAt =
        parseDate(message.date) ?? parseDate(parsed.order_date) ?? new Date();

      const outcome = await prisma.$transaction(async (tx) => {
        await tx.orderLog.create({ data: { userId, houseId, messageId, platform } });
        if (parsed.items.length === 0) return { created: 0, merged: 0 };
        return addOrMergeItems(
          tx,
          houseId,
          userId,
          parsed.items.map((item) => ({
            rawName: item.name,
            normalizedCategory: item.category,
            quantity: item.quantity || 1,
            unit: item.unit || "unit",
            purchasedAt,
            expiresAt: computeExpiresAt(item.category, purchasedAt),
            source: platform,
          }))
        );
      });

      results.push({ messageId, status: "processed", created: outcome.created, merged: outcome.merged });
    } catch (err) {
      // Gemini quota/rate-limit: every subsequent call will fail too, so stop
      // the batch and report cleanly instead of hammering the API.
      if (isRateLimit(err)) {
        rateLimited = true;
        results.push({ messageId, status: "error:rate-limited" });
        break;
      }
      // Any other per-email failure: record and keep going with the rest.
      console.error(`[gmail/sync] failed on ${messageId}:`, (err as Error).message);
      results.push({ messageId, status: `error:${(err as Error).message}` });
    }
  }

  await markSynced(userId);

  const processed = results.filter((r) => r.status === "processed");
  const totalCreated = processed.reduce((s, r) => s + (r.created ?? 0), 0);
  const totalMerged = processed.reduce((s, r) => s + (r.merged ?? 0), 0);

  // Nothing synced AND we were rate-limited → surface a clear, actionable error.
  if (rateLimited && totalCreated + totalMerged === 0) {
    return NextResponse.json(
      {
        error:
          "Gemini's free-tier quota is exhausted across all fallback models. Try again later (per-model quotas reset over minutes-to-hours), or enable billing on the Gemini project to lift the limit.",
        results,
      },
      { status: 429 }
    );
  }

  return NextResponse.json({
    ok: true,
    results,
    totalCreated,
    totalMerged,
    note: rateLimited
      ? "Stopped early: Gemini quota was reached. Re-run later to finish the rest."
      : undefined,
  });
}

/** True if an error is a Gemini/Google rate-limit or quota rejection (HTTP 429). */
function isRateLimit(err: unknown): boolean {
  const e = err as { status?: number; message?: string };
  return e?.status === 429 || /quota|rate.?limit|too many requests/i.test(e?.message ?? "");
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}
