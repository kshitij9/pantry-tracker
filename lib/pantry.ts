import { Prisma } from "@prisma/client";

/**
 * Pantry write logic with de-duplication.
 *
 * When the same item is added again (manual, invoice, or auto-synced order),
 * we merge it into the existing un-consumed row instead of creating a duplicate:
 *   - quantity is summed
 *   - expiresAt keeps the SOONEST of the two (never hide spoiling stock —
 *     this is an anti-waste app)
 *   - purchasedAt advances to the most recent purchase (for the record)
 *
 * Matching key: normalized name + unit, scoped to the house, un-consumed only.
 * A previously consumed item won't absorb a fresh purchase — you get a new row.
 */

export interface IncomingPantryItem {
  rawName: string;
  normalizedCategory: string;
  quantity: number;
  unit: string;
  purchasedAt: Date;
  expiresAt: Date;
  source: string;
}

/** Canonicalize a product name for matching (case/space/punctuation-insensitive). */
export function normalizeName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Matching key: normalized name + normalized unit. */
function itemKey(rawName: string, unit: string): string {
  return `${normalizeName(rawName)}|${unit.toLowerCase().trim()}`;
}

/**
 * Insert the given items into a house's pantry, merging duplicates.
 * Runs against a Prisma transaction client so the caller controls atomicity.
 * Returns how many rows were newly created vs. merged into existing ones.
 */
export async function addOrMergeItems(
  tx: Prisma.TransactionClient,
  houseId: string,
  purchasedById: string | null,
  incoming: IncomingPantryItem[]
): Promise<{ created: number; merged: number }> {
  // 1. Aggregate duplicates *within* this batch first.
  const batched = new Map<string, IncomingPantryItem>();
  for (const item of incoming) {
    if (!item.rawName?.trim() || !item.normalizedCategory?.trim()) continue;
    const qty = Number(item.quantity) || 1;
    const key = itemKey(item.rawName, item.unit);
    const existing = batched.get(key);
    if (existing) {
      existing.quantity += qty;
      existing.expiresAt = minDate(existing.expiresAt, item.expiresAt);
      existing.purchasedAt = maxDate(existing.purchasedAt, item.purchasedAt);
    } else {
      batched.set(key, { ...item, quantity: qty });
    }
  }

  if (batched.size === 0) return { created: 0, merged: 0 };

  // 2. Load current un-consumed items once and index them by key.
  const current = await tx.pantryItem.findMany({
    where: { houseId, isConsumed: false },
    select: {
      id: true,
      rawName: true,
      unit: true,
      quantity: true,
      expiresAt: true,
      purchasedAt: true,
    },
  });
  const currentByKey = new Map(
    current.map((c) => [itemKey(c.rawName, c.unit), c])
  );

  let created = 0;
  let merged = 0;

  // 3. Merge into an existing row, or create a new one.
  for (const item of batched.values()) {
    const match = currentByKey.get(itemKey(item.rawName, item.unit));
    if (match) {
      await tx.pantryItem.update({
        where: { id: match.id },
        data: {
          quantity: match.quantity + item.quantity,
          expiresAt: minDate(match.expiresAt, item.expiresAt),
          purchasedAt: maxDate(match.purchasedAt, item.purchasedAt),
        },
      });
      merged++;
    } else {
      await tx.pantryItem.create({
        data: {
          houseId,
          purchasedById,
          rawName: item.rawName.trim(),
          normalizedCategory: item.normalizedCategory.trim(),
          quantity: item.quantity,
          unit: item.unit || "pcs",
          purchasedAt: item.purchasedAt,
          expiresAt: item.expiresAt,
          source: item.source,
        },
      });
      created++;
    }
  }

  return { created, merged };
}

function minDate(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b;
}
function maxDate(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}
