"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Undo2, Settings2, UtensilsCrossed } from "lucide-react";
import { LogMealModal } from "@/components/meals/LogMealModal";
import { mealsApi } from "@/lib/meals/client";
import type { MealLogDTO } from "@/lib/meals/types";

export default function MealsPage() {
  const [logs, setLogs] = useState<MealLogDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setLogs((await mealsApi.history()).logs);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function undo(id: string) {
    setLogs((prev) => prev.filter((l) => l.id !== id)); // optimistic
    try {
      await mealsApi.undo(id);
    } catch {
      load(); // rollback via refetch
    }
  }

  const groups = groupByDay(logs);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Meals</h1>
          <p className="text-sm text-neutral-500">Log meals to deduct ingredients from your pantry.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/meals/templates" className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-100 dark:border-neutral-800 dark:hover:bg-neutral-800">
            <Settings2 className="h-4 w-4" /> Templates
          </Link>
          <button onClick={() => setModalOpen(true)} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700">
            <Plus className="h-4 w-4" /> Log Meal
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-neutral-500">Loading…</p>
      ) : logs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 p-10 text-center text-neutral-500 dark:border-neutral-700">
          <UtensilsCrossed className="mx-auto mb-2 h-8 w-8" />
          No meals logged yet. Tap <span className="font-medium">Log Meal</span> to start.
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(({ label, items }) => (
            <section key={label} className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">{label}</h2>
              <ul className="space-y-2">
                {items.map((log) => (
                  <li key={log.id} className="flex items-start justify-between gap-3 rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
                    <div className="flex min-w-0 gap-3">
                      <span className="text-2xl">{log.icon}</span>
                      <div className="min-w-0">
                        <p className="font-medium">{log.name}</p>
                        <p className="text-xs text-neutral-500">
                          {new Date(log.loggedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          {log.loggedByName ? ` · ${log.loggedByName}` : ""}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {log.deductions.map((d, i) => (
                            <span
                              key={i}
                              className={`rounded-full px-2 py-0.5 text-xs ${
                                d.status === "missing" || d.status === "skipped" || d.status === "unit_mismatch"
                                  ? "bg-neutral-100 text-neutral-400 line-through dark:bg-neutral-800"
                                  : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                              }`}
                            >
                              {d.ingredientName}
                              {d.deductedQty > 0 ? ` −${round(d.deductedQty)}${d.deductedUnit ?? ""}` : ""}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <button onClick={() => undo(log.id)} title="Undo (restores inventory)" className="flex shrink-0 items-center gap-1 rounded-md border border-neutral-200 px-2.5 py-1.5 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800">
                      <Undo2 className="h-3.5 w-3.5" /> Undo
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <LogMealModal open={modalOpen} onClose={() => setModalOpen(false)} onLogged={load} />
    </div>
  );
}

function groupByDay(logs: MealLogDTO[]) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const buckets: Record<string, MealLogDTO[]> = { Today: [], Yesterday: [], Earlier: [] };
  for (const log of logs) {
    const d = new Date(log.loggedAt); d.setHours(0, 0, 0, 0);
    if (d.getTime() === today.getTime()) buckets.Today.push(log);
    else if (d.getTime() === yesterday.getTime()) buckets.Yesterday.push(log);
    else buckets.Earlier.push(log);
  }
  return [
    { label: "Today", items: buckets.Today },
    { label: "Yesterday", items: buckets.Yesterday },
    { label: "Earlier", items: buckets.Earlier },
  ].filter((g) => g.items.length > 0);
}

function round(n: number) { return Math.round(n * 100) / 100; }
