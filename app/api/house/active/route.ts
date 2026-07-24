import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { switchActiveHouse } from "@/lib/house";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/house/active — switch the active house. Body: { houseId }. */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const houseId = String(body?.houseId ?? "").trim();
  if (!houseId) {
    return NextResponse.json({ error: "houseId is required." }, { status: 400 });
  }

  const ok = await switchActiveHouse(session.user.id, houseId);
  if (!ok) {
    return NextResponse.json(
      { error: "You are not a member of that house." },
      { status: 403 }
    );
  }
  // Client should call `update({ activeHouseId: houseId })` to refresh the JWT.
  return NextResponse.json({ ok: true, activeHouseId: houseId });
}
