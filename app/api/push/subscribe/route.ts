import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/push/subscribe
 * Persist a browser's Web Push subscription for the current user.
 * Body: a PushSubscription JSON (endpoint + keys.p256dh + keys.auth).
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sub = await req.json().catch(() => null);
  const endpoint = sub?.endpoint as string | undefined;
  const p256dh = sub?.keys?.p256dh as string | undefined;
  const authKey = sub?.keys?.auth as string | undefined;

  if (!endpoint || !p256dh || !authKey) {
    return NextResponse.json({ error: "Invalid subscription." }, { status: 400 });
  }

  // Upsert by endpoint so re-subscribing the same browser doesn't duplicate,
  // and re-attaches it to the current user if it moved accounts.
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { userId: session.user.id, p256dh, auth: authKey },
    create: { userId: session.user.id, endpoint, p256dh, auth: authKey },
  });

  return NextResponse.json({ ok: true });
}
