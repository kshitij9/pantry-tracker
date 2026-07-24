import { NextRequest, NextResponse } from "next/server";
import { resolveHouseContext } from "@/lib/auth-helpers";
import { duplicateTemplate } from "@/lib/meals/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/meals/templates/[id]/duplicate — clone a template. */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const r = await resolveHouseContext();
  if (!r.ok) return r.response;
  const template = await duplicateTemplate(r.ctx.houseId, r.ctx.userId, params.id);
  if (!template) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ template }, { status: 201 });
}
