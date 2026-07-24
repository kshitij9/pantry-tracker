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

  const tTokens = tokens(term);
  const cTokens = tokens(candidateName);
  const cSet = new Set(cTokens);

  // All ingredient tokens present in the candidate.
  if (tTokens.length > 0 && tTokens.every((tok) => cSet.has(tok))) return 0.85;

  // Substring containment either direction.
  if (c.includes(t) || t.includes(c)) return 0.7;

  // Token overlap (Jaccard).
  const inter = tTokens.filter((tok) => cSet.has(tok)).length;
  const union = new Set([...tTokens, ...cTokens]).size;
  const jaccard = union ? inter / union : 0;
  if (jaccard > 0) return Math.min(0.6, jaccard * 0.6 + 0.2);

  // Fuzzy fallback.
  const dist = levenshtein(t, c);
  const sim = 1 - dist / Math.max(t.length, c.length);
  return sim > 0.72 ? sim * 0.55 : 0;
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
