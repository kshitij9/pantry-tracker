import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createHouse, listHousesForUser } from "@/lib/house";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/house — list the houses the current user belongs to. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const houses = await listHousesForUser(session.user.id);
  return NextResponse.json({ houses, activeHouseId: session.user.activeHouseId });
}

/** POST /api/house — create a new house (creator becomes OWNER + active). */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "House name is required." }, { status: 400 });
  }

  const house = await createHouse(session.user.id, name);
  // Client should call `update({ activeHouseId: house.id })` to refresh the JWT.
  return NextResponse.json({ house }, { status: 201 });
}
