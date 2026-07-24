import { NextRequest, NextResponse } from "next/server";
import { resolveHouseContext } from "@/lib/auth-helpers";
import { listTemplates, createTemplate } from "@/lib/meals/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/meals/templates — list templates for the active house. */
export async function GET() {
  const r = await resolveHouseContext();
  if (!r.ok) return r.response;
  return NextResponse.json({ templates: await listTemplates(r.ctx.houseId) });
}

/** POST /api/meals/templates — create a template. Body: { name, icon?, isFavorite?, ingredients[] }. */
export async function POST(req: NextRequest) {
  const r = await resolveHouseContext();
  if (!r.ok) return r.response;

  const body = await req.json().catch(() => null);
  if (!body?.name?.trim() || !Array.isArray(body.ingredients)) {
    return NextResponse.json(
      { error: "name and ingredients[] are required." },
      { status: 400 }
    );
  }
  const template = await createTemplate(r.ctx.houseId, r.ctx.userId, {
    name: body.name,
    icon: body.icon,
    isFavorite: body.isFavorite,
    ingredients: body.ingredients,
  });
  return NextResponse.json({ template }, { status: 201 });
}
