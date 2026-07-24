import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user";
import { computeExpiresAt } from "@/lib/categories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/pantry
 * List active (unconsumed) pantry items for the current user, sorted by
 * soonest expiry first. Optional `?includeConsumed=true` to include all.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  const includeConsumed =
    req.nextUrl.searchParams.get("includeConsumed") === "true";

  const items = await prisma.pantryItem.findMany({
    where: {
      userId: user.id,
      ...(includeConsumed ? {} : { isConsumed: false }),
    },
    orderBy: { expiresAt: "asc" },
  });

  return NextResponse.json({ items });
}

/**
 * POST /api/pantry
 * Manually add a pantry item. Body:
 *   { rawName, normalizedCategory, quantity?, unit?, purchasedAt?, expiresAt? }
 * If `expiresAt` is omitted, it's computed from the category shelf-life.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => null);

  if (!body?.rawName || !body?.normalizedCategory) {
    return NextResponse.json(
      { error: "rawName and normalizedCategory are required." },
      { status: 400 }
    );
  }

  const purchasedAt = body.purchasedAt ? new Date(body.purchasedAt) : new Date();
  const expiresAt = body.expiresAt
    ? new Date(body.expiresAt)
    : computeExpiresAt(body.normalizedCategory, purchasedAt);

  const item = await prisma.pantryItem.create({
    data: {
      userId: user.id,
      rawName: String(body.rawName),
      normalizedCategory: String(body.normalizedCategory),
      quantity: Number(body.quantity) || 1,
      unit: String(body.unit || "unit"),
      purchasedAt,
      expiresAt,
      source: "manual",
    },
  });

  return NextResponse.json({ item }, { status: 201 });
}
