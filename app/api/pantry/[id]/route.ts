import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/pantry/[id]
 * Update a single item. Supports:
 *   { isConsumed: boolean }          -> toggle consumed state
 *   { decrement: number }            -> decrement quantity; auto-consume at <= 0
 *   { quantity, unit, ... }          -> arbitrary field updates
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({}));

  // Ensure the item belongs to this user before mutating.
  const existing = await prisma.pantryItem.findFirst({
    where: { id: params.id, userId: user.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
  }

  const data: Record<string, unknown> = {};

  if (typeof body.isConsumed === "boolean") {
    data.isConsumed = body.isConsumed;
  }

  if (typeof body.decrement === "number") {
    const nextQty = existing.quantity - body.decrement;
    data.quantity = Math.max(0, nextQty);
    if (nextQty <= 0) data.isConsumed = true;
  }

  // Allow direct edits to these safe fields.
  for (const field of ["quantity", "unit", "rawName", "normalizedCategory"] as const) {
    if (body[field] !== undefined && data[field] === undefined) {
      data[field] = body[field];
    }
  }
  if (body.expiresAt) data.expiresAt = new Date(body.expiresAt);

  const item = await prisma.pantryItem.update({
    where: { id: params.id },
    data,
  });

  return NextResponse.json({ item });
}

/**
 * DELETE /api/pantry/[id]
 * Permanently remove a pantry item.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentUser();

  const existing = await prisma.pantryItem.findFirst({
    where: { id: params.id, userId: user.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
  }

  await prisma.pantryItem.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
