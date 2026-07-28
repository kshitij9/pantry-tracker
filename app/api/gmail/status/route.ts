import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveHouseContext } from "@/lib/auth-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/gmail/status — the caller's Gmail connection state (for the UI).
 * Returns { connected, email, lastSyncedAt, watchExpiresAt, watchActive }.
 */
export async function GET() {
  const r = await resolveHouseContext();
  if (!r.ok) return r.response;

  const conn = await prisma.gmailConnection.findUnique({
    where: { userId: r.ctx.userId },
    select: { email: true, lastSyncedAt: true, watchExpiresAt: true },
  });

  if (!conn) {
    return NextResponse.json({ connected: false });
  }

  return NextResponse.json({
    connected: true,
    email: conn.email,
    lastSyncedAt: conn.lastSyncedAt?.toISOString() ?? null,
    watchExpiresAt: conn.watchExpiresAt?.toISOString() ?? null,
    watchActive: conn.watchExpiresAt ? conn.watchExpiresAt.getTime() > Date.now() : false,
  });
}
