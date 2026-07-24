/**
 * Central catalog of pantry categories and their default shelf life (in days).
 * `expiresAt` for an item is derived as `purchasedAt + shelfLifeDays`.
 *
 * These defaults are intentionally conservative. If Gemini returns a category
 * we don't recognize, we fall back to `DEFAULT_SHELF_LIFE_DAYS`.
 */

export const CATEGORY_SHELF_LIFE: Record<string, number> = {
  "Leafy Greens": 3,
  Dairy: 4,
  "Fresh Produce": 5,
  Fruits: 6,
  Meat: 2,
  Seafood: 2,
  Eggs: 21,
  "Root Veggies": 12,
  Bakery: 4,
  Beverages: 30,
  Snacks: 90,
  Frozen: 90,
  Staples: 120,
  Condiments: 180,
};

export const DEFAULT_SHELF_LIFE_DAYS = 14;

/** High-level tabs the dashboard groups categories into for filtering. */
export const CATEGORY_GROUPS: Record<string, string[]> = {
  Produce: ["Leafy Greens", "Fresh Produce", "Fruits", "Root Veggies"],
  Dairy: ["Dairy", "Eggs"],
  Staples: ["Staples", "Condiments", "Bakery"],
  Snacks: ["Snacks", "Beverages", "Frozen"],
};

/** The list of valid categories, exposed to Gemini so it classifies consistently. */
export const KNOWN_CATEGORIES = Object.keys(CATEGORY_SHELF_LIFE);

/**
 * Compute the expiry date for an item given its category and purchase date.
 */
export function computeExpiresAt(
  category: string,
  purchasedAt: Date = new Date()
): Date {
  const days = CATEGORY_SHELF_LIFE[category] ?? DEFAULT_SHELF_LIFE_DAYS;
  const expires = new Date(purchasedAt);
  expires.setDate(expires.getDate() + days);
  return expires;
}

/**
 * Map an arbitrary category string to one of the dashboard filter groups.
 * Returns "Other" if the category doesn't belong to a known group.
 */
export function groupForCategory(category: string): string {
  for (const [group, cats] of Object.entries(CATEGORY_GROUPS)) {
    if (cats.includes(category)) return group;
  }
  return "Other";
}
