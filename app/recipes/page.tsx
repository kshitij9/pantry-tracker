"use client";

import { useState } from "react";
import { ChefHat, Clock, Sparkles, Check, ShoppingCart } from "lucide-react";

interface Recipe {
  title: string;
  prep_time_minutes: number;
  description: string;
  matching_items: string[];
  missing_essentials: string[];
  steps: string[];
}

export default function RecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [cooked, setCooked] = useState<Record<number, boolean>>({});

  async function generate() {
    setLoading(true);
    setError(null);
    setMessage(null);
    setCooked({});
    try {
      const res = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate recipes");
      setRecipes(data.recipes ?? []);
      if (data.message) setMessage(data.message);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  /**
   * "Cooked This" — mark every pantry item this recipe used as consumed.
   * We match by name against the active pantry, then PATCH each match.
   */
  async function cookedThis(recipe: Recipe, index: number) {
    const res = await fetch("/api/pantry", { cache: "no-store" });
    const { items } = await res.json();

    const usedLower = recipe.matching_items.map((n) => n.toLowerCase());
    const toConsume = (items as Array<{ id: string; rawName: string }>).filter((i) =>
      usedLower.some(
        (name) =>
          i.rawName.toLowerCase().includes(name) || name.includes(i.rawName.toLowerCase())
      )
    );

    await Promise.all(
      toConsume.map((i) =>
        fetch(`/api/pantry/${i.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isConsumed: true }),
        })
      )
    );

    setCooked((prev) => ({ ...prev, [index]: true }));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Recipe ideas</h1>
          <p className="text-sm text-neutral-500">
            AI recipes that prioritize your soonest-to-expire ingredients.
          </p>
        </div>
        <button
          onClick={generate}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4" />
          {loading ? "Cooking up ideas…" : "Generate recipes"}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-neutral-500">{message}</p>}

      {recipes.length === 0 && !loading && !message && (
        <div className="rounded-xl border border-dashed border-neutral-300 p-10 text-center text-neutral-500 dark:border-neutral-700">
          <ChefHat className="mx-auto mb-2 h-8 w-8" />
          Hit “Generate recipes” to see what you can make right now.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {recipes.map((recipe, i) => (
          <article
            key={i}
            className="flex flex-col rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <h2 className="text-lg font-semibold">{recipe.title}</h2>
            <p className="mt-1 flex items-center gap-1 text-xs text-neutral-500">
              <Clock className="h-3.5 w-3.5" /> {recipe.prep_time_minutes} min
            </p>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              {recipe.description}
            </p>

            <Section title="Uses from your pantry">
              <div className="flex flex-wrap gap-1.5">
                {recipe.matching_items.map((m) => (
                  <span
                    key={m}
                    className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                  >
                    {m}
                  </span>
                ))}
              </div>
            </Section>

            {recipe.missing_essentials.length > 0 && (
              <Section title="You'll also need">
                <div className="flex flex-wrap gap-1.5">
                  {recipe.missing_essentials.map((m) => (
                    <span
                      key={m}
                      className="flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                    >
                      <ShoppingCart className="h-3 w-3" /> {m}
                    </span>
                  ))}
                </div>
              </Section>
            )}

            <Section title="Steps">
              <ol className="list-decimal space-y-1 pl-4 text-sm text-neutral-600 dark:text-neutral-400">
                {recipe.steps.map((s, idx) => (
                  <li key={idx}>{s}</li>
                ))}
              </ol>
            </Section>

            <button
              onClick={() => cookedThis(recipe, i)}
              disabled={cooked[i]}
              className="mt-4 flex items-center justify-center gap-1.5 rounded-lg border border-emerald-600 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:border-neutral-300 disabled:text-neutral-400 dark:hover:bg-emerald-950"
            >
              <Check className="h-4 w-4" />
              {cooked[i] ? "Marked as cooked" : "Cooked this"}
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">
        {title}
      </h3>
      {children}
    </div>
  );
}
