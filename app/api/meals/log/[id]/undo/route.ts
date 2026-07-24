import { NextRequest, NextResponse } from "next/server";
import { resolveHouseContext } from "@/lib/auth-helpers";
import { undoMeal } from "@/lib/meals/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/meals/log/[id]/undo — restore deducted inventory and hide the log. */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const r = await resolveHouseContext();
  if (!r.ok) return r.response;
  const ok = await undoMeal(r.ctx.houseId, params.id);
  if (!ok) {
    return NextResponse.json(
      { error: "Meal not found or already undone." },
      { status: 404 }
    );
  }
  return NextResponse.json({ ok: true });
}
