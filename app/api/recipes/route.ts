import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user";
import { generateRecipes, type InventoryLine } from "@/lib/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/recipes
 * Fetch the user's unconsumed pantry (soonest-expiring first) and ask Gemini
 * for 3 recipes. Optional body `{ limit?: number }` caps how many items we send.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    const body = await req.json().catch(() => ({}));
    const limit = Number(body?.limit) || 25;

    const items = await prisma.pantryItem.findMany({
      where: { userId: user.id, isConsumed: false },
      orderBy: { expiresAt: "asc" },
      take: limit,
    });

    if (items.length === 0) {
      return NextResponse.json({
        recipes: [],
        message: "Your pantry is empty — add items to get recipe ideas.",
      });
    }

    const now = Date.now();
    const inventory: InventoryLine[] = items.map((i) => ({
      name: i.rawName,
      quantity: i.quantity,
      unit: i.unit,
      category: i.normalizedCategory,
      expiresInDays: Math.max(
        0,
        Math.round((i.expiresAt.getTime() - now) / (1000 * 60 * 60 * 24))
      ),
    }));

    const { recipes } = await generateRecipes(inventory);
    return NextResponse.json({ recipes });
  } catch (err) {
    console.error("[recipes] error:", err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
