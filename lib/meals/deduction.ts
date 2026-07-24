import { convert, compatible } from "./units";
import type { InventoryCandidate, DeductionLine, IngredientPlan } from "./types";

/**
 * FIFO deduction planner. Pure — computes what WOULD be deducted, no DB writes.
 *
 * Given an ingredient (requested qty + unit) and its name-matched pantry items
 * (already sorted soonest-expiry first by the matcher), draw down the requested
 * amount across items earliest-expiry first, converting units as needed.
 */

const EPS = 1e-6;

export function planIngredientFIFO(
  ingredient: { name: string; quantity: number; unit: string; optional?: boolean },
  nameMatches: InventoryCandidate[]
): IngredientPlan {
  const optional = ingredient.optional ?? false;
  const base: Omit<IngredientPlan, "status" | "matched" | "availableQty"> = {
    name: ingredient.name,
    requestedQty: ingredient.quantity,
    requestedUnit: ingredient.unit,
    optional,
  };

  if (nameMatches.length === 0) {
    return { ...base, status: "missing", availableQty: 0, matched: [] };
  }

  // Keep only unit-compatible items (same dimension as the request).
  const usable = nameMatches.filter((c) => compatible(c.unit, ingredient.unit));
  if (usable.length === 0) {
    // Matched by name but e.g. request is "ml" and stock is counted in "pcs".
    return { ...base, status: "unit_mismatch", availableQty: 0, matched: [] };
  }

  // Total available expressed in the requested unit.
  const availableQty = usable.reduce(
    (sum, c) => sum + (convert(c.quantity, c.unit, ingredient.unit) ?? 0),
    0
  );

  let remaining = ingredient.quantity;
  const matched: DeductionLine[] = [];

  for (const c of usable) {
    if (remaining <= EPS) break;
    const availInReq = convert(c.quantity, c.unit, ingredient.unit) ?? 0;
    if (availInReq <= EPS) continue;

    const takeInReq = Math.min(remaining, availInReq);
    const deductInItemUnit = convert(takeInReq, ingredient.unit, c.unit) ?? 0;
    const willConsume = takeInReq >= availInReq - EPS;

    matched.push({
      pantryItemId: c.id,
      pantryName: c.rawName,
      unit: c.unit,
      deductQty: round(deductInItemUnit),
      expiresAt: c.expiresAt,
      willConsume,
    });
    remaining -= takeInReq;
  }

  const status = remaining <= EPS ? "matched" : "partial";
  return { ...base, status, availableQty: round(availableQty), matched };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
