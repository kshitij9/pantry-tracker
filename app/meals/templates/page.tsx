"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Star, Copy, Pencil, Trash2, ArrowLeft } from "lucide-react";
import { TemplateEditor } from "@/components/meals/TemplateEditor";
import { mealsApi } from "@/lib/meals/client";
import type { TemplateDTO } from "@/lib/meals/types";

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<TemplateDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<TemplateDTO | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTemplates((await mealsApi.listTemplates()).templates);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function duplicate(id: string) { await mealsApi.duplicateTemplate(id); load(); }
  async function remove(id: string) {
    if (!confirm("Delete this template? (Logged meals are unaffected.)")) return;
    await mealsApi.deleteTemplate(id);
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/meals" className="mb-1 flex items-center gap-1 text-xs text-neutral-500 hover:underline">
            <ArrowLeft className="h-3 w-3" /> Back to meals
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Meal templates</h1>
          <p className="text-sm text-neutral-500">Reusable meals with their ingredient lists.</p>
        </div>
        <button onClick={() => setCreating(true)} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700">
          <Plus className="h-4 w-4" /> New template
        </button>
      </div>

      {loading ? (
        <p className="text-neutral-500">Loading…</p>
      ) : templates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 p-10 text-center text-neutral-500 dark:border-neutral-700">
          No templates yet. Create your first meal (e.g. Coffee, Omelette).
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {templates.map((t) => (
            <li key={t.id} className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
              <div className="flex items-start justify-between">
                <div className="flex gap-3">
                  <span className="text-2xl">{t.icon}</span>
                  <div>
                    <p className="flex items-center gap-1 font-medium">
                      {t.name}
                      {t.isFavorite && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {t.ingredients.map((i) => `${i.name} ${i.quantity}${i.unit}`).join(" · ")}
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex gap-1">
                <IconBtn onClick={() => setEditing(t)} title="Edit"><Pencil className="h-4 w-4" /></IconBtn>
                <IconBtn onClick={() => duplicate(t.id)} title="Duplicate"><Copy className="h-4 w-4" /></IconBtn>
                <IconBtn onClick={() => remove(t.id)} title="Delete" danger><Trash2 className="h-4 w-4" /></IconBtn>
              </div>
            </li>
          ))}
        </ul>
      )}

      {(creating || editing) && (
        <TemplateEditor
          open
          template={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={load}
        />
      )}
    </div>
  );
}

function IconBtn({ children, onClick, title, danger }: { children: React.ReactNode; onClick: () => void; title: string; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`rounded-md border border-neutral-200 p-1.5 dark:border-neutral-700 ${danger ? "hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950" : "hover:bg-neutral-100 dark:hover:bg-neutral-800"}`}
    >
      {children}
    </button>
  );
}
