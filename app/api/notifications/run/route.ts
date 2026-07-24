import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPush } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// How far ahead we look. With a once-daily cron, ~36h reliably surfaces items
// "about a day before" they expire without missing any between runs.
const NOTIFY_WINDOW_HOURS = 36;

/**
 * GET|POST /api/notifications/run
 *
 * Cron endpoint (Vercel Cron). Finds un-consumed items expiring within the
 * next ~36h that haven't been notified, and sends one push per household
 * member summarizing them. Idempotent via PantryItem.expiryNotifiedAt.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. For manual
 * runs, `?token=<CRON_SECRET>` is also accepted.
 */
export async function POST(req: NextRequest) {
  return run(req);
}
export async function GET(req: NextRequest) {
  return run(req);
}

async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = req.headers.get("authorization");
    const token = req.nextUrl.searchParams.get("token");
    const ok = authHeader === `Bearer ${secret}` || token === secret;
    if (!ok) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const now = new Date();
  const until = new Date(now.getTime() + NOTIFY_WINDOW_HOURS * 60 * 60 * 1000);

  // Items expiring soon, not yet notified.
  const items = await prisma.pantryItem.findMany({
    where: {
      isConsumed: false,
      expiryNotifiedAt: null,
      expiresAt: { gt: now, lte: until },
    },
    select: { id: true, houseId: true, rawName: true, expiresAt: true },
    orderBy: { expiresAt: "asc" },
  });

  if (items.length === 0) {
    return NextResponse.json({ ok: true, housesNotified: 0, pushesSent: 0, itemsFlagged: 0 });
  }

  // Group expiring items by house.
  const byHouse = new Map<string, typeof items>();
  for (const item of items) {
    const list = byHouse.get(item.houseId) ?? [];
    list.push(item);
    byHouse.set(item.houseId, list);
  }

  let pushesSent = 0;
  const staleEndpoints: string[] = [];

  for (const [houseId, houseItems] of byHouse) {
    const house = await prisma.house.findUnique({
      where: { id: houseId },
      select: {
        name: true,
        members: {
          select: {
            user: { select: { pushSubscriptions: true } },
          },
        },
      },
    });
    if (!house) continue;

    const payload = buildPayload(house.name, houseItems);

    // Every member's every device.
    const subs = house.members.flatMap((m) => m.user.pushSubscriptions);
    for (const sub of subs) {
      const result = await sendPush(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        payload
      );
      if (result === "sent") pushesSent++;
      else if (result === "expired") staleEndpoints.push(sub.endpoint);
    }
  }

  // Mark items notified so we don't repeat, and prune dead subscriptions.
  await prisma.pantryItem.updateMany({
    where: { id: { in: items.map((i) => i.id) } },
    data: { expiryNotifiedAt: now },
  });
  if (staleEndpoints.length) {
    await prisma.pushSubscription.deleteMany({
      where: { endpoint: { in: staleEndpoints } },
    });
  }

  return NextResponse.json({
    ok: true,
    housesNotified: byHouse.size,
    pushesSent,
    itemsFlagged: items.length,
    prunedSubscriptions: staleEndpoints.length,
  });
}

function buildPayload(
  houseName: string,
  items: Array<{ rawName: string; expiresAt: Date }>
) {
  const names = items.map((i) => i.rawName);
  const preview =
    names.length <= 3
      ? names.join(", ")
      : `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;
  const count = items.length;

  return {
    title: `${count} item${count === 1 ? "" : "s"} expiring soon`,
    body: `${preview} in ${houseName} — use ${count === 1 ? "it" : "them"} before ${count === 1 ? "it goes" : "they go"} off.`,
    url: "/dashboard",
    tag: "expiry-reminder",
  };
}
