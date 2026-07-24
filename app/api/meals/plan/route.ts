import { NextRequest, NextResponse } from "next/server";
import { resolveHouseContext } from "@/lib/auth-helpers";
import { planMeal } from "@/lib/meals/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/meals/plan
 * Preview what logging these ingredients would consume (matching + FIFO), no
 * writes. Body: { ingredients: [{ name, quantity, unit, aliases?, optional? }] }.
 */
export async function POST(req: NextRequest) {
  const r = await resolveHouseContext();
  if (!r.ok) return r.response;

  const body = await req.json().catch(() => null);
  if (!Array.isArray(body?.ingredients)) {
    return NextResponse.json({ error: "ingredients[] is required." }, { status: 400 });
  }
  const plan = await planMeal(r.ctx.houseId, body.ingredients);
  return NextResponse.json(plan);
}
