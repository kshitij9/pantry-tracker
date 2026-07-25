import { NextRequest, NextResponse } from "next/server";
import { resolveHouseContext } from "@/lib/auth-helpers";
import { suggestMealIngredients } from "@/lib/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Gemini call — allow extra time on Vercel.
export const maxDuration = 60;

/**
 * POST /api/meals/suggest-ingredients
 * Given a meal name, return an approximate ingredient list to pre-fill a
 * template. Body: { name }. Response: { ingredients: [{ name, quantity, unit }] }.
 */
export async function POST(req: NextRequest) {
  const r = await resolveHouseContext();
  if (!r.ok) return r.response;

  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "A meal name is required." }, { status: 400 });
  }

  try {
    const ingredients = await suggestMealIngredients(name);
    return NextResponse.json({ ingredients });
  } catch (err) {
    console.error("[meals/suggest-ingredients] error:", err);
    return NextResponse.json(
      { error: "Couldn't generate ingredients. Try again or add them manually." },
      { status: 500 }
    );
  }
}
