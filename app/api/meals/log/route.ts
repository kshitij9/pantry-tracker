import { NextRequest, NextResponse } from "next/server";
import { resolveHouseContext } from "@/lib/auth-helpers";
import { commitMeal } from "@/lib/meals/service";
import { listMealLogs } from "@/lib/meals/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/meals/log — meal history (most recent first). */
export async function GET() {
  const r = await resolveHouseContext();
  if (!r.ok) return r.response;
  return NextResponse.json({ logs: await listMealLogs(r.ctx.houseId) });
}

/**
 * POST /api/meals/log — commit a meal: deduct inventory (FIFO) and record it.
 * Body: CommitMealInput { name, icon?, templateId?, source?, ingredients[] }.
 */
export async function POST(req: NextRequest) {
  const r = await resolveHouseContext();
  if (!r.ok) return r.response;

  const body = await req.json().catch(() => null);
  if (!body?.name?.trim() || !Array.isArray(body.ingredients)) {
    return NextResponse.json({ error: "name and ingredients[] are required." }, { status: 400 });
  }

  const result = await commitMeal(r.ctx.houseId, r.ctx.userId, {
    name: body.name,
    icon: body.icon,
    templateId: body.templateId ?? null,
    source: body.source ?? (body.templateId ? "TEMPLATE" : "ADHOC"),
    note: body.note,
    ingredients: body.ingredients,
  });
  return NextResponse.json(result, { status: 201 });
}
