import { normalizeName } from "@/lib/pantry";
import type { InventoryCandidate } from "./types";

/**
 * Ingredient ↔ inventory matching engine. Pure functions.
 *
 * Template ingredients are names ("Milk"), not ids, so at log time we score
 * every un-consumed pantry item against the ingredient name + aliases and keep
 * the ones above a threshold. Strategy, strongest first:
 *   1. exact normalized equality           -> 1.00
 *   2. all ingredient tokens ⊆ item tokens  -> 0.85  ("milk" in "amul taaza milk")
 *   3. item name contains the term          -> 0.70
 *   4. token overlap (Jaccard)              -> ≤0.60
 *   5. fuzzy (Levenshtein similarity)       -> ≤0.55
 */

export const DEFAULT_MATCH_THRESHOLD = 0.6;

function tokens(s: string): string[] {
  return normalizeName(s).split(" ").filter(Boolean);
}

/** Naive singularizer so "mushrooms" matches "mushroom", "tomatoes" -> "tomato". */
function stem(w: string): string {
  if (w.length <= 3) return w;
  if (w.endsWith("ies")) return w.slice(0, -3) + "y"; // berries -> berry
  if (w.endsWith("oes")) return w.slice(0, -2); // tomatoes -> tomato
  if (/(ses|xes|zes|ches|shes)$/.test(w)) return w.slice(0, -2);
  if (w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1); // eggs -> egg
  return w;
}

// Descriptor words that add noise to matching (recipe phrasing vs pantry label).
const FILLER = new Set([
  "fresh", "organic", "whole", "raw", "cooked", "ripe", "large", "small",
  "medium", "premium", "natural", "pure", "sliced", "chopped", "diced",
  "grated", "minced", "peeled", "boiled", "roasted", "pack", "packet",
  "packed", "of", "a", "the",
]);

/** Significant tokens: stemmed, filler removed (falls back if that empties it). */
function sigTokens(s: string): string[] {
  const stemmed = tokens(s).map(stem);
  const filtered = stemmed.filter((t) => !FILLER.has(t));
  return filtered.length ? filtered : stemmed;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => i);
  for (let j = 1; j <= n; j++) {
    let prev = dp[0];
    dp[0] = j;
    for (let i = 1; i <= m; i++) {
      const tmp = dp[i];
      dp[i] = Math.min(
        dp[i] + 1,
        dp[i - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      prev = tmp;
    }
  }
  return dp[m];
}

/** Score a single term against a candidate name in [0, 1]. */
function scoreTerm(term: string, candidateName: string): number {
  const t = normalizeName(term);
  const c = normalizeName(candidateName);
  if (!t || !c) return 0;
  if (t === c) return 1;

  const ta = sigTokens(term);
  const ca = sigTokens(candidateName);
  if (ta.length === 0 || ca.length === 0) return 0;
  const tSet = new Set(ta);
  const cSet = new Set(ca);

  // Same significant token set (order/plurals/filler aside).
  if (ta.length === ca.length && ta.every((x) => cSet.has(x))) return 0.95;

  // Directional containment: the shorter name's tokens all appear in the other.
  // Handles "button mushrooms" ⊆ "button mushroom (anabe)" and "milk" ⊆ "amul milk".
  if (ta.every((x) => cSet.has(x))) return 0.85; // ingredient ⊆ candidate
  if (ca.every((x) => tSet.has(x))) return 0.8; // candidate ⊆ ingredient

  // Strong partial overlap (shared head noun etc.).
  const inter = ta.filter((x) => cSet.has(x)).length;
  const coverage = inter / Math.min(ta.length, ca.length);
  if (coverage >= 0.67) return 0.62;

  // Substring containment either direction.
  if (c.includes(t) || t.includes(c)) return 0.7;

  // Jaccard overlap.
  const union = new Set([...ta, ...ca]).size;
  const jaccard = union ? inter / union : 0;
  if (jaccard > 0) return Math.min(0.55, jaccard * 0.6);

  // Fuzzy fallback.
  const dist = levenshtein(t, c);
  const sim = 1 - dist / Math.max(t.length, c.length);
  return sim > 0.8 ? sim * 0.55 : 0;
}

/** Best score for an ingredient (name + aliases) against a candidate. */
export function scoreCandidate(
  ingredientName: string,
  aliases: string[],
  candidate: InventoryCandidate
): number {
  const terms = [ingredientName, ...(aliases ?? [])];
  return Math.max(...terms.map((term) => scoreTerm(term, candidate.rawName)));
}

/**
 * Return the inventory candidates that match an ingredient, above `threshold`,
 * sorted by soonest expiry (FIFO order) — ties broken by higher score.
 */
export function matchInventory(
  ingredientName: string,
  aliases: string[],
  candidates: InventoryCandidate[],
  threshold = DEFAULT_MATCH_THRESHOLD
): Array<{ candidate: InventoryCandidate; score: number }> {
  return candidates
    .map((candidate) => ({ candidate, score: scoreCandidate(ingredientName, aliases, candidate) }))
    .filter((m) => m.score >= threshold)
    .sort(
      (a, b) =>
        a.candidate.expiresAt.getTime() - b.candidate.expiresAt.getTime() ||
        b.score - a.score
    );
}
