"use client";

import { useState } from "react";
import { X, Plus, Trash2, Star, Sparkles, Loader2 } from "lucide-react";
import { mealsApi } from "@/lib/meals/client";
import type { TemplateDTO } from "@/lib/meals/types";

/** Merge helper: keep user-entered rows, append AI ones not already present. */
function mergeIngredients(existing: Row[], incoming: Row[]): Row[] {
  const kept = existing.filter((r) => r.name.trim());
  const have = new Set(kept.map((r) => r.name.trim().toLowerCase()));
  const added = incoming.filter((r) => r.name.trim() && !have.has(r.name.trim().toLowerCase()));
  const merged = [...kept, ...added];
  return merged.length ? merged : [{ name: "", quantity: 1, unit: "pcs" }];
}

interface Row { name: string; quantity: number; unit: string }

/** Create or edit a meal template. Pass `template` to edit, omit to create. */
export function TemplateEditor({
  open,
  template,
  onClose,
  onSaved,
}: {
  open: boolean;
  template?: TemplateDTO | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(template?.name ?? "");
  const [icon, setIcon] = useState(template?.icon ?? "🍽️");
  const [isFavorite, setIsFavorite] = useState(template?.isFavorite ?? false);
  const [rows, setRows] = useState<Row[]>(
    template?.ingredients.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit })) ?? [
      { name: "", quantity: 1, unit: "pcs" },
    ]
  );
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function patch(i: number, p: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
  }

  async function suggestIngredients() {
    if (!name.trim()) {
      setError("Enter a meal name first, then let AI suggest ingredients.");
      return;
    }
    setSuggesting(true);
    setError(null);
    try {
      const { ingredients } = await mealsApi.suggestIngredients(name.trim());
      if (ingredients.length === 0) {
        setError("No ingredients suggested — add them manually.");
        return;
      }
      setRows((prev) =>
        mergeIngredients(
          prev,
          ingredients.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit }))
        )
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSuggesting(false);
    }
  }

  async function save() {
    const ingredients = rows.filter((r) => r.name.trim());
    if (!name.trim() || ingredients.length === 0) {
      setError("Add a name and at least one ingredient.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = { name, icon: icon || "🍽️", isFavorite, ingredients };
      if (template) await mealsApi.updateTemplate(template.id, payload);
      else await mealsApi.createTemplate(payload);
      onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl border border-neutral-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center justify-between border-b border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="text-lg font-semibold">{template ? "Edit template" : "New template"}</h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-neutral-100 dark:hover:bg-neutral-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="flex gap-2">
            <input
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              className="w-14 rounded-lg border border-neutral-300 bg-transparent px-2 py-2 text-center text-xl dark:border-neutral-700"
              aria-label="Emoji icon"
            />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Meal name (e.g. Coffee)"
              className="flex-1 rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
            />
            <button
              onClick={() => setIsFavorite((v) => !v)}
              title="Favourite"
              className={`rounded-lg border px-3 ${isFavorite ? "border-amber-300 bg-amber-50 text-amber-600 dark:bg-amber-950" : "border-neutral-300 text-neutral-400 dark:border-neutral-700"}`}
            >
              <Star className={`h-4 w-4 ${isFavorite ? "fill-amber-400" : ""}`} />
            </button>
          </div>

          <button
            onClick={suggestIngredients}
            disabled={suggesting}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-emerald-300 bg-emerald-50/50 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100/60 disabled:opacity-60 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
          >
            {suggesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {suggesting ? "Asking AI…" : "Suggest ingredients with AI"}
          </button>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Ingredients</p>
            {rows.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={row.name}
                  onChange={(e) => patch(i, { name: e.target.value })}
                  placeholder="Ingredient"
                  className="min-w-0 flex-1 rounded-md border border-neutral-300 bg-transparent px-2 py-1.5 text-sm dark:border-neutral-700"
                />
                <input
                  type="number" min={0} step="0.1" value={row.quantity}
                  onChange={(e) => patch(i, { quantity: Number(e.target.value) })}
                  className="w-16 rounded-md border border-neutral-300 bg-transparent px-2 py-1.5 text-sm dark:border-neutral-700"
                />
                <input
                  value={row.unit}
                  onChange={(e) => patch(i, { unit: e.target.value })}
                  placeholder="unit"
                  className="w-16 rounded-md border border-neutral-300 bg-transparent px-2 py-1.5 text-sm dark:border-neutral-700"
                />
                <button onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))} className="rounded-md p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button onClick={() => setRows((prev) => [...prev, { name: "", quantity: 1, unit: "pcs" }])} className="flex items-center gap-1 text-sm text-emerald-600 hover:underline">
              <Plus className="h-4 w-4" /> Add ingredient
            </button>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-neutral-200 p-4 dark:border-neutral-800">
          <button onClick={onClose} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800">Cancel</button>
          <button onClick={save} disabled={saving} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
            {saving ? "Saving…" : "Save template"}
          </button>
        </div>
      </div>
    </div>
  );
}
