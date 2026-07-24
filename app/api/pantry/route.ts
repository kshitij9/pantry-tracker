import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveHouseContext } from "@/lib/auth-helpers";
import { computeExpiresAt } from "@/lib/categories";
import { addOrMergeItems } from "@/lib/pantry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/pantry
 * List active (unconsumed) pantry items for the caller's active house,
 * soonest-expiry first. Includes who purchased each item. Optional
 * `?includeConsumed=true` to include all.
 */
export async function GET(req: NextRequest) {
  const resolved = await resolveHouseContext();
  if (!resolved.ok) return resolved.response;
  const { houseId } = resolved.ctx;

  const includeConsumed =
    req.nextUrl.searchParams.get("includeConsumed") === "true";

  const items = await prisma.pantryItem.findMany({
    where: {
      houseId,
      ...(includeConsumed ? {} : { isConsumed: false }),
    },
    orderBy: { expiresAt: "asc" },
    include: {
      purchasedBy: { select: { id: true, name: true, email: true, image: true } },
    },
  });

  return NextResponse.json({ items });
}

/**
 * POST /api/pantry
 * Manually add a pantry item to the active house, attributed to the caller.
 * Body: { rawName, normalizedCategory, quantity?, unit?, purchasedAt?, expiresAt? }
 */
export async function POST(req: NextRequest) {
  const resolved = await resolveHouseContext();
  if (!resolved.ok) return resolved.response;
  const { houseId, userId } = resolved.ctx;

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

  // De-duplicate: merges into an existing un-consumed item if one matches.
  const result = await prisma.$transaction((tx) =>
    addOrMergeItems(tx, houseId, userId, [
      {
        rawName: String(body.rawName),
        normalizedCategory: String(body.normalizedCategory),
        quantity: Number(body.quantity) || 1,
        unit: String(body.unit || "unit"),
        purchasedAt,
        expiresAt,
        source: "manual",
      },
    ])
  );

  return NextResponse.json(result, { status: 201 });
}
