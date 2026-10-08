import rows from "./russian_foods.json";

export type FoodReferenceRow = {
  name_ru: string;
  name_en: string;
  search_keys: string[];
  calories: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  sugar_g?: number;
  fiber_g?: number;
};

export const foodReference: readonly FoodReferenceRow[] = rows as FoodReferenceRow[];
