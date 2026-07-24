"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { LogMealModal } from "./LogMealModal";
import { mealsApi } from "@/lib/meals/client";
import type { TemplateDTO, SuggestionDTO } from "@/lib/meals/types";

function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h >= 5 && h < 12) return "Good morning";
  if (h >= 12 && h < 17) return "Good afternoon";
  if (h >= 17 && h < 22) return "Good evening";
  return "Hello";
}

/** Home-screen quick-log row: greeting + suggested meal chips. */
export function QuickLog({ onLogged }: { onLogged?: () => void }) {
  const { data: session } = useSession();
  const [suggestions, setSuggestions] = useState<SuggestionDTO[]>([]);
  const [templates, setTemplates] = useState<TemplateDTO[]>([]);
  const [preselected, setPreselected] = useState<TemplateDTO | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  async function load() {
    const [s, t] = await Promise.all([
      mealsApi.suggestions().catch(() => ({ suggestions: [] })),
      mealsApi.listTemplates().catch(() => ({ templates: [] })),
    ]);
    setSuggestions(s.suggestions);
    setTemplates(t.templates);
  }

  useEffect(() => { load(); }, []);

  const firstName = useMemo(() => (session?.user?.name ?? "").split(" ")[0], [session]);

  function openWith(templateId: string) {
    const t = templates.find((x) => x.id === templateId) ?? null;
    setPreselected(t);
    setModalOpen(true);
  }

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <p className="font-medium">
        {greeting()}{firstName ? `, ${firstName}` : ""} 👋
      </p>
      {suggestions.length > 0 ? (
        <>
          <p className="mb-2 mt-0.5 text-xs text-neutral-500">Quick log</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s.templateId}
                onClick={() => openWith(s.templateId)}
                title={s.reason}
                className="flex items-center gap-1.5 rounded-full border border-neutral-200 px-3 py-1.5 text-sm hover:border-emerald-400 hover:bg-emerald-50/40 dark:border-neutral-700 dark:hover:bg-emerald-950/20"
              >
                <span>{s.icon}</span> {s.name}
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="mt-1 text-xs text-neutral-500">
          Create meal templates to quick-log meals and auto-deduct ingredients.
        </p>
      )}

      <LogMealModal
        open={modalOpen}
        preselected={preselected}
        onClose={() => setModalOpen(false)}
        onLogged={() => { onLogged?.(); load(); }}
      />
    </section>
  );
}
