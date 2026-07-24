import { prisma } from "@/lib/prisma";
import { matchInventory } from "./matching";
import { planIngredientFIFO } from "./deduction";
import { getInventoryCandidates, listTemplates, recentTemplateUsage } from "./repository";
import type {
  IngredientSpec,
  MealPlan,
  IngredientPlan,
  CommitMealInput,
  InventoryCandidate,
  SuggestionDTO,
} from "./types";

/**
 * Meal-logging service — the orchestration layer. Business logic lives here,
 * composed from the pure matching/deduction modules and the repository.
 * API routes and UI must not re-implement any of this.
 */

const EPS = 1e-6;

/**
 * Preview what logging these ingredients would consume, without writing.
 * Allocates a working copy of inventory so ingredients sharing the same pantry
 * item (e.g. two recipes both using milk) don't double-count availability.
 */
export async function planMeal(
  houseId: string,
  ingredients: IngredientSpec[]
): Promise<MealPlan> {
  const candidates = await getInventoryCandidates(houseId);
  const working = new Map(candidates.map((c) => [c.id, { ...c }]));

  const plans: IngredientPlan[] = [];
  for (const ing of ingredients) {
    const plan = planAgainstWorking(ing, working);
    applyToWorking(plan, working);
    plans.push(plan);
  }

  const canLogCleanly = plans.every((p) => p.optional || p.status === "matched");
  return { ingredients: plans, canLogCleanly };
}

/** Match + FIFO-plan one ingredient against the current working inventory. */
function planAgainstWorking(
  ing: IngredientSpec,
  working: Map<string, InventoryCandidate>
): IngredientPlan {
  const live = [...working.values()].filter((c) => c.quantity > EPS);
  const matches = matchInventory(ing.name, ing.aliases ?? [], live).map((m) => m.candidate);
  return planIngredientFIFO(
    { name: ing.name, quantity: ing.quantity, unit: ing.unit, optional: ing.optional },
    matches
  );
}

/** Reduce the working copy by a plan's deductions (in item units). */
function applyToWorking(plan: IngredientPlan, working: Map<string, InventoryCandidate>) {
  for (const line of plan.matched) {
    const item = working.get(line.pantryItemId);
    if (!item) continue;
    // deductQty is in the item's own unit.
    item.quantity = Math.max(0, item.quantity - line.deductQty);
  }
}

/**
 * Commit a meal log: execute FIFO deductions and record everything for undo.
 * Missing/partial ingredients are recorded (the client decides whether to
 * proceed); per-ingredient `action: "skip"` logs it without touching stock.
 */
export async function commitMeal(
  houseId: string,
  userId: string,
  input: CommitMealInput
): Promise<{ mealLogId: string; plan: MealPlan }> {
  return prisma.$transaction(async (tx) => {
    const candidates = await tx.pantryItem.findMany({
      where: { houseId, isConsumed: false, quantity: { gt: 0 } },
      select: { id: true, rawName: true, quantity: true, unit: true, expiresAt: true },
    });
    const working = new Map(candidates.map((c) => [c.id, { ...c }]));

    const deductionRows: Array<{
      ingredientName: string;
      requestedQty: number;
      requestedUnit: string;
      status: string;
      pantryItemId?: string;
      deductedQty?: number;
      deductedUnit?: string;
      consumedFlagged?: boolean;
    }> = [];
    const planLines: IngredientPlan[] = [];

    for (const ing of input.ingredients) {
      if (ing.action === "skip") {
        deductionRows.push({
          ingredientName: ing.name,
          requestedQty: ing.quantity,
          requestedUnit: ing.unit,
          status: "skipped",
        });
        planLines.push({
          name: ing.name, requestedQty: ing.quantity, requestedUnit: ing.unit,
          status: "skipped", optional: ing.optional ?? false, availableQty: 0, matched: [],
        });
        continue;
      }

      const plan = planAgainstWorking(ing, working);
      planLines.push(plan);

      if (plan.matched.length === 0) {
        deductionRows.push({
          ingredientName: ing.name,
          requestedQty: ing.quantity,
          requestedUnit: ing.unit,
          status: plan.status, // "missing" | "unit_mismatch"
        });
        continue;
      }

      // Execute each FIFO draw against the DB and the working copy.
      for (const line of plan.matched) {
        const item = working.get(line.pantryItemId);
        if (!item) continue;
        const newQty = Math.max(0, round(item.quantity - line.deductQty));
        const consume = line.willConsume || newQty <= EPS;
        await tx.pantryItem.update({
          where: { id: line.pantryItemId },
          data: { quantity: newQty, ...(consume ? { isConsumed: true } : {}) },
        });
        item.quantity = consume ? 0 : newQty;

        deductionRows.push({
          ingredientName: ing.name,
          requestedQty: ing.quantity,
          requestedUnit: ing.unit,
          status: plan.status, // "matched" | "partial"
          pantryItemId: line.pantryItemId,
          deductedQty: line.deductQty,
          deductedUnit: line.unit,
          consumedFlagged: consume,
        });
      }
    }

    const log = await tx.mealLog.create({
      data: {
        houseId,
        loggedById: userId,
        templateId: input.templateId ?? null,
        name: input.name,
        icon: input.icon ?? "🍽️",
        source: input.source ?? "TEMPLATE",
        note: input.note,
        deductions: { create: deductionRows },
      },
    });

    const canLogCleanly = planLines.every((p) => p.optional || p.status === "matched");
    return { mealLogId: log.id, plan: { ingredients: planLines, canLogCleanly } };
  });
}

/**
 * Undo a meal log: restore every deducted amount to its pantry item and mark
 * the log undone. Items deleted since logging can't be restored (skipped).
 */
export async function undoMeal(houseId: string, logId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const log = await tx.mealLog.findFirst({
      where: { id: logId, houseId, undoneAt: null },
      include: { deductions: true },
    });
    if (!log) return false;

    for (const d of log.deductions) {
      if (!d.pantryItemId || d.deductedQty <= 0) continue;
      const item = await tx.pantryItem.findUnique({ where: { id: d.pantryItemId } });
      if (!item) continue; // item removed since — can't restore this portion
      await tx.pantryItem.update({
        where: { id: d.pantryItemId },
        data: {
          quantity: round(item.quantity + d.deductedQty),
          ...(d.consumedFlagged ? { isConsumed: false } : {}),
        },
      });
    }

    await tx.mealLog.update({ where: { id: logId }, data: { undoneAt: new Date() } });
    return true;
  });
}

/**
 * Suggested quick-log templates, ranked by favourite, recent usage frequency,
 * and a light time-of-day nudge.
 */
export async function getSuggestions(houseId: string, limit = 6): Promise<SuggestionDTO[]> {
  const [templates, usage] = await Promise.all([
    listTemplates(houseId),
    recentTemplateUsage(houseId),
  ]);

  const slot = timeSlot(new Date());
  const scored = templates.map((t) => {
    const uses = usage.get(t.id) ?? 0;
    const timeHit = matchesTimeSlot(t.name, slot);
    let score = uses * 2;
    if (t.isFavorite) score += 3;
    if (timeHit) score += 2;

    let reason = "";
    if (t.isFavorite) reason = "Favourite";
    else if (uses >= 3) reason = "You log this often";
    else if (timeHit) reason = `Popular in the ${slot}`;
    else if (uses > 0) reason = "Logged recently";

    return { templateId: t.id, name: t.name, icon: t.icon, reason, score };
  });

  return scored
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map(({ templateId, name, icon, reason }) => ({ templateId, name, icon, reason }));
}

type Slot = "morning" | "afternoon" | "evening" | "night";
function timeSlot(d: Date): Slot {
  const h = d.getHours();
  if (h >= 5 && h < 11) return "morning";
  if (h >= 11 && h < 16) return "afternoon";
  if (h >= 16 && h < 22) return "evening";
  return "night";
}
const SLOT_KEYWORDS: Record<Slot, string[]> = {
  morning: ["coffee", "tea", "breakfast", "omelette", "egg", "toast", "cereal", "oats", "poha", "idli", "dosa", "juice"],
  afternoon: ["lunch", "rice", "salad", "sandwich", "bowl", "roti", "dal"],
  evening: ["dinner", "curry", "soup", "pasta", "snack", "maggi"],
  night: ["dinner", "milk", "dessert"],
};
function matchesTimeSlot(name: string, slot: Slot): boolean {
  const n = name.toLowerCase();
  return SLOT_KEYWORDS[slot].some((k) => n.includes(k));
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
