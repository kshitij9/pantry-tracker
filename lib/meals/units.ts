/**
 * Unit normalization & conversion. Pure functions, no I/O.
 *
 * Everything reduces to a base unit per dimension:
 *   mass   -> grams (g)
 *   volume -> millilitres (ml)
 *   count  -> pieces (pcs)
 * Conversions only happen within a dimension; cross-dimension (g <-> ml) is
 * intentionally not supported (would require per-ingredient density).
 */

export type Dimension = "mass" | "volume" | "count";

interface UnitDef {
  dimension: Dimension;
  toBase: number; // multiply a value in this unit to get base units
}

// Synonyms map to a canonical unit key.
const UNIT_ALIASES: Record<string, string> = {
  g: "g", gram: "g", grams: "g", gm: "g", gms: "g",
  kg: "kg", kgs: "kg", kilogram: "kg", kilograms: "kg", kilo: "kg",
  mg: "mg", milligram: "mg", milligrams: "mg",
  ml: "ml", milliliter: "ml", millilitre: "ml", milliliters: "ml",
  l: "l", ltr: "l", litre: "l", liter: "l", litres: "l", liters: "l",
  pcs: "pcs", pc: "pcs", piece: "pcs", pieces: "pcs", nos: "pcs", no: "pcs",
  unit: "pcs", units: "pcs", pack: "pcs", packs: "pcs", ct: "pcs", count: "pcs",
  dozen: "dozen",
};

const UNITS: Record<string, UnitDef> = {
  g: { dimension: "mass", toBase: 1 },
  kg: { dimension: "mass", toBase: 1000 },
  mg: { dimension: "mass", toBase: 0.001 },
  ml: { dimension: "volume", toBase: 1 },
  l: { dimension: "volume", toBase: 1000 },
  pcs: { dimension: "count", toBase: 1 },
  dozen: { dimension: "count", toBase: 12 },
};

/** Canonicalize a unit string (e.g. "Grams" -> "g"). Returns null if unknown. */
export function normalizeUnit(unit: string): string | null {
  const key = unit.trim().toLowerCase();
  return UNIT_ALIASES[key] ?? (UNITS[key] ? key : null);
}

export function getDimension(unit: string): Dimension | null {
  const canonical = normalizeUnit(unit);
  return canonical ? UNITS[canonical].dimension : null;
}

/** Convert a quantity to base units for its dimension. Null if unit unknown. */
export function toBase(qty: number, unit: string): { dimension: Dimension; value: number } | null {
  const canonical = normalizeUnit(unit);
  if (!canonical) return null;
  const def = UNITS[canonical];
  return { dimension: def.dimension, value: qty * def.toBase };
}

/** Convert `qty` from one unit to another within the same dimension. Null if incompatible. */
export function convert(qty: number, fromUnit: string, toUnit: string): number | null {
  const from = toBase(qty, fromUnit);
  const toCanonical = normalizeUnit(toUnit);
  if (!from || !toCanonical) return null;
  const toDef = UNITS[toCanonical];
  if (from.dimension !== toDef.dimension) return null;
  return from.value / toDef.toBase;
}

/** True if two units belong to the same dimension (so they can be summed/deducted). */
export function compatible(a: string, b: string): boolean {
  const da = getDimension(a);
  const db = getDimension(b);
  return da !== null && da === db;
}
