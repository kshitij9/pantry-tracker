/**
 * Domain types & DTOs for the meal-logging feature.
 * These are transport/domain shapes shared by the service and the API/UI —
 * decoupled from Prisma models.
 */

export type IngredientStatus =
  | "matched" // enough inventory found
  | "partial" // some inventory, not enough
  | "missing" // no match
  | "unit_mismatch" // matched by name but units aren't convertible
  | "skipped"; // user chose not to deduct

/** A template ingredient line (name-based, not tied to a pantry item). */
export interface IngredientSpec {
  id?: string;
  name: string;
  quantity: number;
  unit: string;
  aliases?: string[];
  optional?: boolean;
}

export interface TemplateIngredientDTO {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  aliases: string[];
  optional: boolean;
}

export interface TemplateDTO {
  id: string;
  name: string;
  icon: string;
  isFavorite: boolean;
  ingredients: TemplateIngredientDTO[];
}

/** Minimal pantry item the matcher/deducter needs. */
export interface InventoryCandidate {
  id: string;
  rawName: string;
  quantity: number;
  unit: string;
  expiresAt: Date;
}

/** One planned draw from a specific pantry item. */
export interface DeductionLine {
  pantryItemId: string;
  pantryName: string;
  unit: string; // the pantry item's unit
  deductQty: number; // amount in that unit
  expiresAt: Date;
  willConsume: boolean; // does this empty the item?
}

/** Plan for a single ingredient of a meal (no DB writes yet). */
export interface IngredientPlan {
  name: string;
  requestedQty: number;
  requestedUnit: string;
  status: IngredientStatus;
  optional: boolean;
  /** Total available for this ingredient, in the requested unit. */
  availableQty: number;
  matched: DeductionLine[];
}

export interface MealPlan {
  ingredients: IngredientPlan[];
  /** True if every non-optional ingredient can be fully deducted. */
  canLogCleanly: boolean;
}

/** Per-ingredient instruction when committing a log. */
export interface CommitIngredient {
  name: string;
  quantity: number;
  unit: string;
  aliases?: string[];
  optional?: boolean;
  /** "deduct" (default) executes FIFO; "skip" records it without touching stock. */
  action?: "deduct" | "skip";
}

export interface CommitMealInput {
  name: string;
  icon?: string;
  templateId?: string | null;
  source?: "TEMPLATE" | "ADHOC" | "AI" | "BARCODE" | "VOICE" | "RECURRING";
  note?: string;
  ingredients: CommitIngredient[];
}

export interface MealLogDTO {
  id: string;
  name: string;
  icon: string;
  loggedAt: string;
  loggedByName: string | null;
  undoneAt: string | null;
  deductions: Array<{
    ingredientName: string;
    requestedQty: number;
    requestedUnit: string;
    status: string;
    deductedQty: number;
    deductedUnit: string | null;
    pantryName: string | null;
  }>;
}

export interface SuggestionDTO {
  templateId: string;
  name: string;
  icon: string;
  reason: string; // why it's suggested (for UI subtext)
}
