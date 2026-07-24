import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveHouseContext } from "@/lib/auth-helpers";
import { computeExpiresAt } from "@/lib/categories";
import { addOrMergeItems, type IncomingPantryItem } from "@/lib/pantry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface IncomingItem {
  rawName?: string;
  normalizedCategory?: string;
  quantity?: number;
  unit?: string;
  purchasedAt?: string;
  expiresAt?: string;
}

/**
 * POST /api/pantry/bulk
 * Save multiple pantry items at once to the active house, attributed to the
 * caller. Used to commit the reviewed items from an invoice import.
 * Body: { items: IncomingItem[], source?: string }
 */
export async function POST(req: NextRequest) {
  const resolved = await resolveHouseContext();
  if (!resolved.ok) return resolved.response;
  const { houseId, userId } = resolved.ctx;

  const body = await req.json().catch(() => null);
  const incoming: IncomingItem[] = Array.isArray(body?.items) ? body.items : [];
  const source = typeof body?.source === "string" ? body.source : "invoice";

  // Validate + normalize each row; drop anything missing a name/category.
  const data: IncomingPantryItem[] = incoming
    .filter((i) => i.rawName?.trim() && i.normalizedCategory?.trim())
    .map((i) => {
      const purchasedAt = i.purchasedAt ? new Date(i.purchasedAt) : new Date();
      const expiresAt = i.expiresAt
        ? new Date(i.expiresAt)
        : computeExpiresAt(i.normalizedCategory!, purchasedAt);
      return {
        rawName: String(i.rawName).trim(),
        normalizedCategory: String(i.normalizedCategory).trim(),
        quantity: Number(i.quantity) || 1,
        unit: String(i.unit || "pcs"),
        purchasedAt,
        expiresAt,
        source,
      };
    });

  if (data.length === 0) {
    return NextResponse.json({ error: "No valid items to add." }, { status: 400 });
  }

  // De-duplicate against existing pantry (and within this batch).
  const result = await prisma.$transaction((tx) =>
    addOrMergeItems(tx, houseId, userId, data)
  );
  return NextResponse.json(
    { count: result.created + result.merged, ...result },
    { status: 201 }
  );
}
