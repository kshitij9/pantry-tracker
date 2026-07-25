import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { resolveWebhookTarget } from "@/lib/user";
import {
  fetchMessage,
  findRecentOrderMessageIds,
  resolvePlatform,
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
 * Manually scan and process recent order emails. Useful when:
 *   - A watch expired and you missed a delivery notification.
 *   - You want to force-process without waiting for the next Pub/Sub push.
 *
 * Auth (either works):
 *   - Logged-in session: uses the session user's email (for the dashboard button)
 *   - CRON_SECRET via Bearer header or ?token=: uses body.email or GMAIL_USER_EMAIL env
 *
 * Body (optional): { days?: number (default 7), email?: string (cron mode only) }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const days = Math.min(Number(body?.days ?? 7), 30);

  // Accept either a valid session (dashboard) or CRON_SECRET (cron/curl).
  const session = await auth();
  let targetEmail: string | undefined;

  if (session?.user?.email) {
    // Authenticated user — scan their own mailbox.
    targetEmail = session.user.email;
  } else {
    const secret = process.env.CRON_SECRET;
    const authHeader = req.headers.get("authorization");
    const token = req.nextUrl.searchParams.get("token");
    if (!secret || (authHeader !== `Bearer ${secret}` && token !== secret)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    targetEmail = body?.email ?? process.env.GMAIL_USER_EMAIL ?? process.env.GMAIL_USER_ID;
  }

  const target = targetEmail ? await resolveWebhookTarget(targetEmail) : null;
  if (!target) {
    return NextResponse.json(
      { error: "Could not resolve a registered user for this email address. Make sure the user has signed in and completed onboarding." },
      { status: 404 }
    );
  }
  const { userId, houseId } = target;

  const messageIds = await findRecentOrderMessageIds(20, days);

  const results: Array<{
    messageId: string;
    status: string;
    created?: number;
    merged?: number;
  }> = [];

  for (const messageId of messageIds) {
    const already = await prisma.orderLog.findUnique({ where: { messageId } });
    if (already) {
      results.push({ messageId, status: "skipped:already-processed" });
      continue;
    }

    const message = await fetchMessage(messageId);
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
  }

  const processed = results.filter((r) => r.status === "processed");
  const totalCreated = processed.reduce((s, r) => s + (r.created ?? 0), 0);
  const totalMerged = processed.reduce((s, r) => s + (r.merged ?? 0), 0);

  return NextResponse.json({ ok: true, results, totalCreated, totalMerged });
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}
