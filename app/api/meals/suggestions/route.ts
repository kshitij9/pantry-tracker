import { NextResponse } from "next/server";
import { resolveHouseContext } from "@/lib/auth-helpers";
import { getSuggestions } from "@/lib/meals/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/meals/suggestions — ranked quick-log templates for the active house. */
export async function GET() {
  const r = await resolveHouseContext();
  if (!r.ok) return r.response;
  return NextResponse.json({ suggestions: await getSuggestions(r.ctx.houseId) });
}
