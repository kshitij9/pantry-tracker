import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { joinHouseByCode } from "@/lib/house";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/house/join — join a house via its invite code. Body: { code }. */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const code = String(body?.code ?? "").trim();
  if (!code) {
    return NextResponse.json({ error: "Invite code is required." }, { status: 400 });
  }

  const house = await joinHouseByCode(session.user.id, code);
  if (!house) {
    return NextResponse.json({ error: "Invalid invite code." }, { status: 404 });
  }
  // Client should call `update({ activeHouseId: house.id })` to refresh the JWT.
  return NextResponse.json({ house });
}
