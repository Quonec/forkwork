export type NutritionPer100g = {
  kcal: number;
  proteinMg: number;
  fatMg: number;
  carbsMg: number;
};

export function scaleTo(valuePer100g: number, grams: number): number {
  return Math.round((valuePer100g * grams) / 100);
}
