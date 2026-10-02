/**
 * «Похожее готовят» searches the catalogue by the dish's head word, not its
 * whole name: the FIRST word of the first dish when it has at least three
 * letters — «Плов с мясом» → «Плов» (so the search finds «Плов с бараниной»).
 * A shorter first word («Щи») is no head word: the whole name is searched.
 */
const MIN_HEAD_LETTERS = 3;

export function similarDishQuery(name: string): string {
  const whole = name.trim();
  const first = whole.split(/[^\p{L}\p{N}-]+/u).find((w) => w.length > 0);
  const letters = first?.match(/\p{L}/gu)?.length ?? 0;
  return first !== undefined && letters >= MIN_HEAD_LETTERS ? first : whole;
}

/** Lower case + ё → е: SQLite's own lower() does not fold Cyrillic, so matching happens in JS. */
export const foldRu = (s: string): string => s.toLowerCase().replace(/ё/g, "е");
