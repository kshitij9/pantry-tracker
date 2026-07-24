import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user";
import {
  fetchMessage,
  findRecentOrderMessageIds,
  resolvePlatform,
  type Platform,
} from "@/lib/gmail";
import { extractOrderFromEmail } from "@/lib/gemini";
import { computeExpiresAt } from "@/lib/categories";

// Gmail push notifications must be handled quickly; run on the Node runtime
// (Prisma + googleapis are not edge-compatible) and never cache.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Processing several emails through Gemini can take a while — give the
// serverless function room (max 60s on Vercel Hobby, up to 300s on Pro).
export const maxDuration = 60;

/**
 * POST /api/webhooks/gmail
 *
 * Receives Google Cloud Pub/Sub push notifications for Gmail mailbox changes.
 * Pub/Sub wraps the actual payload as a base64-encoded `message.data` field:
 *
 *   { "message": { "data": "<base64>", "messageId": "...", ... }, "subscription": "..." }
 *
 * The decoded data is `{ "emailAddress": "...", "historyId": "..." }`.
 * Because a historyId alone doesn't identify the new message, we look up recent
 * order emails from known vendors, then parse any we haven't processed yet.
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Optional shared-secret verification (configure on the Pub/Sub push URL).
    const expectedToken = process.env.PUBSUB_VERIFICATION_TOKEN;
    if (expectedToken) {
      const token = req.nextUrl.searchParams.get("token");
      if (token !== expectedToken) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    // 2. Decode the Pub/Sub envelope.
    const envelope = await req.json().catch(() => null);
    const encoded = envelope?.message?.data as string | undefined;

    let notification: { emailAddress?: string; historyId?: string } = {};
    if (encoded) {
      const decoded = Buffer.from(encoded, "base64").toString("utf-8");
      notification = JSON.parse(decoded);
    }

    // 3. Resolve which user this mailbox belongs to.
    //    (Scaffold: single dev user. Production: look up by notification.emailAddress.)
    const user = await getCurrentUser();

    // 4. Find candidate order messages and process the unseen ones.
    const messageIds = await findRecentOrderMessageIds();
    const results: Array<{ messageId: string; status: string; itemCount?: number }> = [];

    for (const messageId of messageIds) {
      // Idempotency guard — skip messages we've already logged.
      const already = await prisma.orderLog.findUnique({ where: { messageId } });
      if (already) {
        results.push({ messageId, status: "skipped:already-processed" });
        continue;
      }

      const message = await fetchMessage(messageId);
      const platform: Platform | null =
        message.platform ?? resolvePlatform(message.from);

      if (!platform) {
        results.push({ messageId, status: "skipped:unknown-vendor" });
        continue;
      }

      // 5. Parse the email into structured items via Gemini.
      const parsed = await extractOrderFromEmail(message.body);

      // Prefer the email's own Date header as the purchase date — it's
      // authoritative and always has a year. Order emails often print a
      // yearless date ("Jul 23") that the model may resolve to the wrong
      // year, so treat the model's order_date only as a last-resort fallback.
      const purchasedAt =
        parseDate(message.date) ?? parseDate(parsed.order_date) ?? new Date();

      // 6. Persist items + an OrderLog atomically.
      const created = await prisma.$transaction(async (tx) => {
        await tx.orderLog.create({
          data: { userId: user.id, messageId, platform },
        });

        if (parsed.items.length === 0) return 0;

        await tx.pantryItem.createMany({
          data: parsed.items.map((item) => ({
            userId: user.id,
            rawName: item.name,
            normalizedCategory: item.category,
            quantity: item.quantity || 1,
            unit: item.unit || "unit",
            purchasedAt,
            expiresAt: computeExpiresAt(item.category, purchasedAt),
            source: platform,
          })),
        });
        return parsed.items.length;
      });

      results.push({ messageId, status: "processed", itemCount: created });
    }

    return NextResponse.json({ ok: true, notification, results });
  } catch (err) {
    console.error("[gmail-webhook] error:", err);
    // Return 200 so Pub/Sub does not aggressively retry on parse errors we
    // can't recover from; log for investigation. Adjust per your retry policy.
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 200 }
    );
  }
}

/** Best-effort ISO/RFC date parse; returns null on failure. */
function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}
