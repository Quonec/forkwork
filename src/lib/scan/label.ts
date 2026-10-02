/**
 * The scan labeller: one recognised dish → its КБЖУ per 100 g, with where the
 * numbers came from. A port of the legacy enrichment (fork-app
 * server/services/_enrichment.py), tier by tier:
 *
 *   1. reference — the Russian reference table (`searchFoodReference`), the
 *      primary tier for this market;
 *   [2. usda, 3. off — USDA FoodData Central and Open Food Facts: declared
 *      in the legacy chain and in the `scan_source` enum's comment, NOT
 *      implemented yet (foreign services; they arrive with the real provider)]
 *   4. ai — the recognizer's own per-100 g estimate.
 *
 * Cross-validation (the legacy `values_agree`): when BOTH a reference row and
 * the model's estimate exist, the reference values are kept only while they
 * agree with the estimate within ±50 % on kcal; when they disagree the model
 * wins — it saw the plate, while a fuzzy table hit may be the wrong food.
 * A model estimate of 0 kcal (or less, once rounded) is no estimate — the
 * legacy `ai_cal > 0` (`_enrichment.py` 163–169): it never beats a reference
 * hit, and alone it labels nothing (the dish is dropped, not shown as 0 ккал).
 *
 * The table's grams are converted to the product's integers exactly ONCE,
 * here: kcal `Math.round`, grams of protein / fat / carbs × 1000 → mg,
 * rounded. A tier whose kcal exceeds 950 per 100 g (nothing edible is denser
 * than pure fat) or that carries a negative or non-finite value is rejected.
 * No tier → null: the dish is dropped and the stream says so (`unlabelled`).
 */
import { searchFoodReference } from "./food-search";
import type { FoodReferenceRow } from "./food-table";
import type { VisionDish } from "./vision-types";

import type { NutritionPer100g } from "./nutrition";

/** The legacy sanity bound (and the `scan_item` CHECK): kcal per 100 g. */
export const MAX_KCAL_PER_100G = 950;

/** The legacy threshold: ±50 %. */
export const AGREEMENT_THRESHOLD = 0.5;

export type LabelSource = "reference" | "ai";

export type LabelledDish = VisionDish & {
  source: LabelSource;
  /** The reference row whose values are used (`source = reference`), else null. */
  referenceName: string | null;
  per100g: NutritionPer100g;
};

/**
 * The legacy `values_agree(db, ai)`: the reference kcal is within ±threshold
 * of the model's; a model value of 0 agrees only with a reference under 20.
 * Bounds are inclusive (exactly ±50 % agrees).
 */
export function valuesAgree(referenceKcal: number, aiKcal: number, threshold: number = AGREEMENT_THRESHOLD): boolean {
  if (aiKcal === 0) return referenceKcal < 20;
  const ratio = referenceKcal / aiKcal;
  return ratio >= 1 - threshold && ratio <= 1 + threshold;
}

/** A table row's per-100 g in the product's integers — the one conversion. */
export function referencePer100g(row: Pick<FoodReferenceRow, "calories" | "protein_g" | "fat_g" | "carbs_g">): NutritionPer100g {
  return {
    kcal: Math.round(row.calories),
    proteinMg: Math.round(row.protein_g * 1000),
    fatMg: Math.round(row.fat_g * 1000),
    carbsMg: Math.round(row.carbs_g * 1000),
  };
}

/** Integers, or null when a value is negative / not finite or the kcal is over the bound. */
function acceptable(raw: NutritionPer100g): NutritionPer100g | null {
  const values = [raw.kcal, raw.proteinMg, raw.fatMg, raw.carbsMg];
  if (!values.every((v) => Number.isFinite(v) && v >= 0)) return null;
  const rounded: NutritionPer100g = {
    kcal: Math.round(raw.kcal),
    proteinMg: Math.round(raw.proteinMg),
    fatMg: Math.round(raw.fatMg),
    carbsMg: Math.round(raw.carbsMg),
  };
  return rounded.kcal <= MAX_KCAL_PER_100G ? rounded : null;
}

export function labelDish(dish: VisionDish): LabelledDish | null {
  const hit = searchFoodReference(dish.name);
  const reference = hit ? acceptable(referencePer100g(hit.row)) : null;
  const estimate = dish.estimatePer100g ? acceptable(dish.estimatePer100g) : null;
  // A zero-kcal estimate counts as absent (the legacy `ai_cal > 0`).
  const ai = estimate && estimate.kcal > 0 ? estimate : null;

  if (hit && reference && (!ai || valuesAgree(reference.kcal, ai.kcal))) {
    return { ...dish, source: "reference", referenceName: hit.row.name_ru, per100g: reference };
  }
  if (ai) return { ...dish, source: "ai", referenceName: null, per100g: ai };
  return null;
}
