import { NextRequest, NextResponse } from "next/server";
import { resolveHouseContext } from "@/lib/auth-helpers";
import { getTemplate, updateTemplate, deleteTemplate } from "@/lib/meals/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/meals/templates/[id] */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const r = await resolveHouseContext();
  if (!r.ok) return r.response;
  const template = await getTemplate(params.id);
  if (!template) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ template });
}

/** PATCH /api/meals/templates/[id] — replace name/icon/favorite/ingredients. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const r = await resolveHouseContext();
  if (!r.ok) return r.response;

  const body = await req.json().catch(() => null);
  if (!body?.name?.trim() || !Array.isArray(body.ingredients)) {
    return NextResponse.json({ error: "name and ingredients[] are required." }, { status: 400 });
  }
  const template = await updateTemplate(params.id, {
    name: body.name,
    icon: body.icon,
    isFavorite: body.isFavorite,
    ingredients: body.ingredients,
  });
  if (!template) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ template });
}

/** DELETE /api/meals/templates/[id] */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const r = await resolveHouseContext();
  if (!r.ok) return r.response;
  const ok = await deleteTemplate(params.id);
  if (!ok) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
