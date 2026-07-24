import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { IngredientSpec, TemplateDTO, InventoryCandidate, MealLogDTO } from "./types";

/**
 * Data-access layer for meals. All DB reads/writes for templates and logs live
 * here; the service composes these with the pure matching/deduction modules.
 */

// ---- Inventory (candidates for matching) ----

export async function getInventoryCandidates(houseId: string): Promise<InventoryCandidate[]> {
  const items = await prisma.pantryItem.findMany({
    where: { houseId, isConsumed: false, quantity: { gt: 0 } },
    select: { id: true, rawName: true, quantity: true, unit: true, expiresAt: true },
  });
  return items;
}

// ---- Templates ----

function toTemplateDTO(t: Prisma.MealTemplateGetPayload<{ include: { ingredients: true } }>): TemplateDTO {
  return {
    id: t.id,
    name: t.name,
    icon: t.icon,
    isFavorite: t.isFavorite,
    ingredients: t.ingredients
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((i) => ({
        id: i.id,
        name: i.name,
        quantity: i.quantity,
        unit: i.unit,
        aliases: i.aliases,
        optional: i.optional,
      })),
  };
}

export async function listTemplates(houseId: string): Promise<TemplateDTO[]> {
  const templates = await prisma.mealTemplate.findMany({
    where: { houseId },
    include: { ingredients: true },
    orderBy: [{ isFavorite: "desc" }, { name: "asc" }],
  });
  return templates.map(toTemplateDTO);
}

export async function getTemplate(houseId: string, id: string): Promise<TemplateDTO | null> {
  const t = await prisma.mealTemplate.findFirst({
    where: { id, houseId },
    include: { ingredients: true },
  });
  return t ? toTemplateDTO(t) : null;
}

export interface TemplateInput {
  name: string;
  icon?: string;
  isFavorite?: boolean;
  ingredients: IngredientSpec[];
}

function ingredientCreateData(ingredients: IngredientSpec[]) {
  return ingredients
    .filter((i) => i.name?.trim())
    .map((i, idx) => ({
      name: i.name.trim(),
      quantity: Number(i.quantity) || 1,
      unit: (i.unit || "pcs").trim(),
      aliases: i.aliases ?? [],
      optional: i.optional ?? false,
      sortOrder: idx,
    }));
}

export async function createTemplate(
  houseId: string,
  userId: string,
  input: TemplateInput
): Promise<TemplateDTO> {
  const t = await prisma.mealTemplate.create({
    data: {
      houseId,
      createdById: userId,
      name: input.name.trim(),
      icon: input.icon || "🍽️",
      isFavorite: input.isFavorite ?? false,
      ingredients: { create: ingredientCreateData(input.ingredients) },
    },
    include: { ingredients: true },
  });
  return toTemplateDTO(t);
}

export async function updateTemplate(
  houseId: string,
  id: string,
  input: TemplateInput
): Promise<TemplateDTO | null> {
  const existing = await prisma.mealTemplate.findFirst({ where: { id, houseId } });
  if (!existing) return null;

  // Replace ingredient set wholesale (simplest correct approach).
  const t = await prisma.$transaction(async (tx) => {
    await tx.mealTemplateIngredient.deleteMany({ where: { templateId: id } });
    return tx.mealTemplate.update({
      where: { id },
      data: {
        name: input.name.trim(),
        icon: input.icon || existing.icon,
        isFavorite: input.isFavorite ?? existing.isFavorite,
        ingredients: { create: ingredientCreateData(input.ingredients) },
      },
      include: { ingredients: true },
    });
  });
  return toTemplateDTO(t);
}

export async function duplicateTemplate(
  houseId: string,
  userId: string,
  id: string
): Promise<TemplateDTO | null> {
  const src = await getTemplate(houseId, id);
  if (!src) return null;
  return createTemplate(houseId, userId, {
    name: `${src.name} (copy)`,
    icon: src.icon,
    isFavorite: false,
    ingredients: src.ingredients,
  });
}

export async function deleteTemplate(houseId: string, id: string): Promise<boolean> {
  const res = await prisma.mealTemplate.deleteMany({ where: { id, houseId } });
  return res.count > 0;
}

// ---- Meal logs ----

export async function listMealLogs(houseId: string, limit = 50): Promise<MealLogDTO[]> {
  const logs = await prisma.mealLog.findMany({
    where: { houseId, undoneAt: null },
    include: { deductions: true, loggedBy: { select: { name: true, email: true } } },
    orderBy: { loggedAt: "desc" },
    take: limit,
  });
  return logs.map((l) => ({
    id: l.id,
    name: l.name,
    icon: l.icon,
    loggedAt: l.loggedAt.toISOString(),
    loggedByName: l.loggedBy?.name ?? l.loggedBy?.email ?? null,
    undoneAt: l.undoneAt?.toISOString() ?? null,
    deductions: dedupeIngredientLines(l.deductions),
  }));
}

/** Group multi-row (FIFO) deductions back into one line per ingredient for display. */
function dedupeIngredientLines(
  deductions: Prisma.MealLogDeductionGetPayload<{}>[]
): MealLogDTO["deductions"] {
  const byIngredient = new Map<string, MealLogDTO["deductions"][number]>();
  for (const d of deductions) {
    const existing = byIngredient.get(d.ingredientName);
    if (existing) {
      existing.deductedQty += d.deductedQty;
    } else {
      byIngredient.set(d.ingredientName, {
        ingredientName: d.ingredientName,
        requestedQty: d.requestedQty,
        requestedUnit: d.requestedUnit,
        status: d.status,
        deductedQty: d.deductedQty,
        deductedUnit: d.deductedUnit,
        pantryName: null,
      });
    }
  }
  return [...byIngredient.values()];
}

/** Usage counts per template within the last `days`, for suggestions. */
export async function recentTemplateUsage(
  houseId: string,
  days = 30
): Promise<Map<string, number>> {
  const since = new Date(Date.now() - days * 86400000);
  const logs = await prisma.mealLog.groupBy({
    by: ["templateId"],
    where: { houseId, undoneAt: null, loggedAt: { gte: since }, templateId: { not: null } },
    _count: { _all: true },
  });
  const map = new Map<string, number>();
  for (const row of logs) if (row.templateId) map.set(row.templateId, row._count._all);
  return map;
}
