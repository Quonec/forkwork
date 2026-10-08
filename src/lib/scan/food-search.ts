/**
 * Fuzzy lookup in the Russian reference table — a port of the legacy
 * scanner's `search_russian_food` (fork-app `server/services/russian_foods.py`
 * lines 62–134), the first tier of the scan labeller (Phase 2).
 *
 * Same algorithm, same threshold, same tie-breaking:
 *  - a candidate cut: the first three letters of every query word (≥ 3
 *    letters) against a prefix index over every key word; no candidate at all
 *    → every row is scored;
 *  - per row, the best score over its keys: an exact key → 1 (and stop); one
 *    string inside the other → 0.85 when the shorter is ≥ 40 % of the longer,
 *    and that key is done either way («ham» never matches «hamburger»); else
 *    word overlap — the share of query words that prefix-match a key word
 *    (both ≥ 4 letters, one a prefix of the other: Russian declensions), or
 *    equal it when shorter;
 *  - the highest score wins, the EARLIEST row on a tie (strictly greater
 *    replaces); below 0.5 is no match.
 *
 * Two changes to the legacy, both deliberate (the Phase 2 spec, §4.1):
 *  1. normalisation, applied to the query AND every key: lower case, `ё → е`,
 *     every punctuation or symbol character → a space (the legacy did this
 *     for the comma only), runs of whitespace collapsed. «Котлета по киевски»
 *     now finds «котлета по-киевски», «печеный» finds «печёный».
 *  2. a row's own `name_ru` is one of its keys. The legacy searched
 *     `search_keys` only, and the plov row's name «плов с мясом» is not among
 *     them — so the legacy resolved «Плов с мясом» to «вареники с мясом» (the
 *     words «с мясом» outvote «плов»). A dish named exactly like a row now
 *     finds that row.
 *
 * Pure, synchronous, no I/O: the index is built once at module load.
 */
import { foodReference, type FoodReferenceRow } from "./food-table";

/** The legacy `threshold` default: a best score below this is no match. */
export const FOOD_SEARCH_THRESHOLD = 0.5;

const PREFIX_LEN = 3;
const PREFIX_MATCH_MIN_LEN = 4;
/** «ham» vs «hamburger»: a substring hit counts only when the shorter is ≥ 40 % of the longer. */
const SUBSTRING_MIN_RATIO = 0.4;
const SUBSTRING_SCORE = 0.85;

/** Lower case, `ё → е`, punctuation/symbols → space, whitespace collapsed and trimmed. */
export function normalizeFoodQuery(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const words = (s: string) => (s === "" ? [] : s.split(" "));

type IndexedRow = { row: FoodReferenceRow; keys: string[] };

/** Every row with its normalised keys (name_ru first, then search_keys, de-duplicated). */
const INDEXED: readonly IndexedRow[] = foodReference.map((row) => ({
  row,
  keys: [...new Set([row.name_ru, ...row.search_keys].map(normalizeFoodQuery).filter((k) => k !== ""))],
}));

/** First three letters of every key word → the rows carrying it (the legacy candidate cut). */
const PREFIX_INDEX: ReadonlyMap<string, readonly number[]> = (() => {
  const index = new Map<string, Set<number>>();
  INDEXED.forEach(({ keys }, i) => {
    for (const key of keys) {
      for (const w of words(key)) {
        if (w.length < PREFIX_LEN) continue;
        const p = w.slice(0, PREFIX_LEN);
        const set = index.get(p) ?? new Set<number>();
        set.add(i);
        index.set(p, set);
      }
    }
  });
  return new Map([...index].map(([p, set]) => [p, [...set].sort((a, b) => a - b)]));
})();

/** True if one word is a prefix of the other (both ≥ 4 letters) — Russian declensions; shorter words must be equal. */
function prefixMatch(a: string, b: string): boolean {
  if (a.length < PREFIX_MATCH_MIN_LEN || b.length < PREFIX_MATCH_MIN_LEN) return a === b;
  return a.startsWith(b) || b.startsWith(a);
}

/** The legacy `_score`: 0..1 for a normalised query against one row's normalised keys. */
function scoreRow(q: string, keys: readonly string[]): number {
  const qWords = words(q);
  let best = 0;
  for (const k of keys) {
    if (q === k) return 1;
    if (k.includes(q) || q.includes(k)) {
      const ratio = Math.min(q.length, k.length) / Math.max(q.length, k.length);
      if (ratio >= SUBSTRING_MIN_RATIO) best = Math.max(best, SUBSTRING_SCORE);
      continue;
    }
    const kWords = words(k);
    if (qWords.length === 0 || kWords.length === 0) continue;
    const matched = qWords.filter((qw) => kWords.some((kw) => prefixMatch(qw, kw))).length;
    best = Math.max(best, matched / qWords.length);
  }
  return best;
}

/** The legacy `_candidate_indices`: rows sharing a 3-letter word prefix, ascending; none → every row. */
function candidates(q: string): readonly number[] {
  const set = new Set<number>();
  for (const w of words(q)) {
    if (w.length < PREFIX_LEN) continue;
    for (const i of PREFIX_INDEX.get(w.slice(0, PREFIX_LEN)) ?? []) set.add(i);
  }
  if (set.size === 0) return INDEXED.map((_, i) => i);
  return [...set].sort((a, b) => a - b);
}

/**
 * The best-matching reference row for a dish name, with its score, or
 * `undefined` when nothing reaches the threshold (or the query is blank).
 */
export function searchFoodReference(
  query: string,
  threshold: number = FOOD_SEARCH_THRESHOLD,
): { row: FoodReferenceRow; score: number } | undefined {
  const q = normalizeFoodQuery(query);
  if (q === "") return undefined;
  let bestIndex = -1;
  let bestScore = 0;
  for (const i of candidates(q)) {
    const s = scoreRow(q, INDEXED[i]!.keys);
    if (s > bestScore) {
      bestScore = s;
      bestIndex = i;
    }
  }
  if (bestIndex === -1 || bestScore < threshold) return undefined;
  return { row: INDEXED[bestIndex]!.row, score: bestScore };
}
