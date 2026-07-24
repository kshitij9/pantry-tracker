"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, Search, Star, Check, AlertTriangle, Loader2, CircleCheck } from "lucide-react";
import { mealsApi } from "@/lib/meals/client";
import type { TemplateDTO, MealPlan, IngredientStatus } from "@/lib/meals/types";

interface Row {
  name: string;
  quantity: number;
  unit: string;
  skip: boolean;
}
type Stage = "pick" | "review" | "done";

export function LogMealModal({
  open,
  onClose,
  onLogged,
  preselected,
}: {
  open: boolean;
  onClose: () => void;
  onLogged: () => void;
  preselected?: TemplateDTO | null;
}) {
  const [templates, setTemplates] = useState<TemplateDTO[]>([]);
  const [stage, setStage] = useState<Stage>("pick");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<TemplateDTO | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [plan, setPlan] = useState<MealPlan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback((t: TemplateDTO) => {
    setSelected(t);
    setRows(t.ingredients.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit, skip: false })));
    setStage("review");
  }, []);

  useEffect(() => {
    if (!open) return;
    mealsApi.listTemplates().then((r) => setTemplates(r.templates)).catch(() => {});
    if (preselected) start(preselected);
  }, [open, preselected, start]);

  // Re-plan (debounced) whenever the ingredient rows change during review.
  const debounce = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (stage !== "review") return;
    setPlanning(true);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      try {
        const p = await mealsApi.plan(
          rows.map((r) => ({ name: r.name, quantity: r.quantity, unit: r.unit }))
        );
        setPlan(p);
      } catch {
        /* ignore transient plan errors */
      } finally {
        setPlanning(false);
      }
    }, 350);
    return () => clearTimeout(debounce.current);
  }, [rows, stage]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? templates.filter((t) => t.name.toLowerCase().includes(q)) : templates;
    return [...list].sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite) || a.name.localeCompare(b.name));
  }, [templates, search]);

  if (!open) return null;

  function reset() {
    setStage("pick"); setSelected(null); setRows([]); setPlan(null); setError(null); setSearch("");
  }
  function close() { reset(); onClose(); }

  function patchRow(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function logMeal() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await mealsApi.commit({
        name: selected.name,
        icon: selected.icon,
        templateId: selected.id,
        source: "TEMPLATE",
        ingredients: rows.map((r) => ({
          name: r.name, quantity: r.quantity, unit: r.unit, action: r.skip ? "skip" : "deduct",
        })),
      });
      setStage("done");
      setTimeout(() => { onLogged(); close(); }, 1300);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl border border-neutral-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center justify-between border-b border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="text-lg font-semibold">
            {stage === "pick" ? "Log a meal" : stage === "review" ? `${selected?.icon} ${selected?.name}` : "Logged!"}
          </h2>
          <button onClick={close} className="rounded-md p-1 hover:bg-neutral-100 dark:hover:bg-neutral-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {stage === "pick" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-lg border border-neutral-300 px-3 dark:border-neutral-700">
                <Search className="h-4 w-4 text-neutral-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search meals…"
                  className="w-full bg-transparent py-2 text-sm outline-none"
                  autoFocus
                />
              </div>
              {filtered.length === 0 ? (
                <p className="py-8 text-center text-sm text-neutral-500">
                  No templates yet. Create one from <span className="font-medium">Meals → Templates</span>.
                </p>
              ) : (
                <ul className="grid grid-cols-2 gap-2">
                  {filtered.map((t) => (
                    <li key={t.id}>
                      <button
                        onClick={() => start(t)}
                        className="flex w-full items-center gap-2 rounded-lg border border-neutral-200 p-3 text-left hover:border-emerald-400 hover:bg-emerald-50/40 dark:border-neutral-800 dark:hover:bg-emerald-950/20"
                      >
                        <span className="text-2xl">{t.icon}</span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1 truncate font-medium">
                            {t.name}
                            {t.isFavorite && <Star className="h-3 w-3 fill-amber-400 text-amber-400" />}
                          </span>
                          <span className="text-xs text-neutral-500">{t.ingredients.length} ingredients</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {stage === "review" && (
            <div className="space-y-3">
              <p className="text-xs text-neutral-500">
                Adjust quantities, skip an ingredient, or rename one to re-match. {planning && "Checking…"}
              </p>
              <ul className="space-y-2">
                {rows.map((row, i) => {
                  const p = plan?.ingredients[i];
                  const status: IngredientStatus = row.skip ? "skipped" : p?.status ?? "matched";
                  return (
                    <li key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 p-2.5 dark:border-neutral-800">
                      <StatusIcon status={status} loading={planning && !row.skip} />
                      <input
                        value={row.name}
                        onChange={(e) => patchRow(i, { name: e.target.value })}
                        className="min-w-[7rem] flex-1 rounded-md border border-neutral-300 bg-transparent px-2 py-1 text-sm dark:border-neutral-700"
                      />
                      <input
                        type="number" min={0} step="0.1" value={row.quantity}
                        onChange={(e) => patchRow(i, { quantity: Number(e.target.value) })}
                        className="w-16 rounded-md border border-neutral-300 bg-transparent px-2 py-1 text-sm dark:border-neutral-700"
                      />
                      <input
                        value={row.unit}
                        onChange={(e) => patchRow(i, { unit: e.target.value })}
                        className="w-14 rounded-md border border-neutral-300 bg-transparent px-2 py-1 text-sm dark:border-neutral-700"
                      />
                      <label className="flex items-center gap-1 text-xs text-neutral-500">
                        <input type="checkbox" checked={row.skip} onChange={(e) => patchRow(i, { skip: e.target.checked })} className="accent-emerald-600" />
                        skip
                      </label>
                      <StatusLabel status={status} plan={p} />
                    </li>
                  );
                })}
              </ul>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
          )}

          {stage === "done" && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <CircleCheck className="h-16 w-16 animate-[pop_0.4s_ease-out] text-emerald-500" />
              <p className="font-medium">{selected?.name} logged</p>
              <p className="text-sm text-neutral-500">Inventory updated. You can undo it from history.</p>
            </div>
          )}
        </div>

        {stage === "review" && (
          <div className="flex items-center justify-between gap-3 border-t border-neutral-200 p-4 dark:border-neutral-800">
            <button onClick={reset} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800">
              Back
            </button>
            <button
              onClick={logMeal}
              disabled={saving}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? "Logging…" : plan && !plan.canLogCleanly ? "Log anyway" : "Log meal"}
            </button>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes pop { 0% { transform: scale(0.4); opacity: 0; } 60% { transform: scale(1.15); } 100% { transform: scale(1); opacity: 1; } }
      `}</style>
    </div>
  );
}

function StatusIcon({ status, loading }: { status: IngredientStatus; loading: boolean }) {
  if (loading) return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-neutral-400" />;
  if (status === "matched") return <Check className="h-4 w-4 shrink-0 text-emerald-600" />;
  if (status === "skipped") return <X className="h-4 w-4 shrink-0 text-neutral-400" />;
  return <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />;
}

function StatusLabel({ status, plan }: { status: IngredientStatus; plan?: { availableQty: number; requestedUnit: string } }) {
  const map: Record<IngredientStatus, string> = {
    matched: "in stock",
    partial: `only ${plan?.availableQty ?? 0}${plan?.requestedUnit ?? ""}`,
    missing: "missing",
    unit_mismatch: "unit mismatch",
    skipped: "won’t deduct",
  };
  const color =
    status === "matched" ? "text-emerald-600"
    : status === "skipped" ? "text-neutral-400"
    : "text-amber-600";
  return <span className={`w-full pl-6 text-xs ${color}`}>{map[status]}</span>;
}
