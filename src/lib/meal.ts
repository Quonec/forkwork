/** Приём пищи по времени суток устройства: подпись кнопки «Продать завтрак / обед / ужин». */
export type Meal = "breakfast" | "lunch" | "dinner";

export const MEALS: { id: Meal; label: string; sell: string; from: number; to: number }[] = [
  { id: "breakfast", label: "Завтрак", sell: "Продать завтрак", from: 5, to: 11 },
  { id: "lunch", label: "Обед", sell: "Продать обед", from: 11, to: 17 },
  { id: "dinner", label: "Ужин", sell: "Продать ужин", from: 17, to: 5 },
];

/** Завтрак с 5:00 до 11:00, обед с 11:00 до 17:00, ужин с 17:00 до 5:00. */
export function mealAt(date = new Date()): Meal {
  const h = date.getHours();
  return h >= 5 && h < 11 ? "breakfast" : h >= 11 && h < 17 ? "lunch" : "dinner";
}

export const mealLabel = (m: Meal) => MEALS.find((x) => x.id === m)!.label;
export const sellLabel = (m: Meal) => MEALS.find((x) => x.id === m)!.sell;
