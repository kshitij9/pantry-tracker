/**
 * Client-side API wrappers for the meal feature. Components call these instead
 * of hitting fetch directly, keeping transport details in one place.
 */
import type {
  TemplateDTO,
  IngredientSpec,
  MealPlan,
  CommitMealInput,
  MealLogDTO,
  SuggestionDTO,
} from "./types";

async function json<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Request failed");
  return data as T;
}

export const mealsApi = {
  listTemplates: () =>
    fetch("/api/meals/templates", { cache: "no-store" }).then(json<{ templates: TemplateDTO[] }>),

  createTemplate: (t: { name: string; icon: string; isFavorite?: boolean; ingredients: IngredientSpec[] }) =>
    fetch("/api/meals/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(t),
    }).then(json<{ template: TemplateDTO }>),

  updateTemplate: (id: string, t: { name: string; icon: string; isFavorite?: boolean; ingredients: IngredientSpec[] }) =>
    fetch(`/api/meals/templates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(t),
    }).then(json<{ template: TemplateDTO }>),

  duplicateTemplate: (id: string) =>
    fetch(`/api/meals/templates/${id}/duplicate`, { method: "POST" }).then(
      json<{ template: TemplateDTO }>
    ),

  deleteTemplate: (id: string) =>
    fetch(`/api/meals/templates/${id}`, { method: "DELETE" }).then(json<{ ok: boolean }>),

  plan: (ingredients: IngredientSpec[]) =>
    fetch("/api/meals/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ingredients }),
    }).then(json<MealPlan>),

  commit: (input: CommitMealInput) =>
    fetch("/api/meals/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then(json<{ mealLogId: string; plan: MealPlan }>),

  history: () =>
    fetch("/api/meals/log", { cache: "no-store" }).then(json<{ logs: MealLogDTO[] }>),

  undo: (id: string) =>
    fetch(`/api/meals/log/${id}/undo`, { method: "POST" }).then(json<{ ok: boolean }>),

  suggestions: () =>
    fetch("/api/meals/suggestions", { cache: "no-store" }).then(
      json<{ suggestions: SuggestionDTO[] }>
    ),
};
