import { NextResponse } from "next/server";
import { resolveHouseContext } from "@/lib/auth-helpers";
import { disconnect } from "@/lib/gmail-connection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/gmail/disconnect — stop the caller's mailbox watch and delete their
 * stored (encrypted) refresh token. Auto-sync stops until they reconnect by
 * signing in again.
 */
export async function POST() {
  const r = await resolveHouseContext();
  if (!r.ok) return r.response;

  await disconnect(r.ctx.userId);
  return NextResponse.json({ ok: true });
}
