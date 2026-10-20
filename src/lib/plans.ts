/**
 * Тарифы повара: сколько позиций (блюд) можно держать в меню. Выбирается при регистрации повара,
 * меняется в кабинете на вкладке «Блюда». Оплаты пока нет: тариф включается сразу.
 */
export type ChefPlan = "free" | "single" | "work";

export const CHEF_PLANS: { id: ChefPlan; label: string; dishes: number; priceRub: number | null; note: string }[] = [
  { id: "free", label: "Free", dishes: 3, priceRub: 0, note: "Чтобы попробовать" },
  { id: "single", label: "Single", dishes: 10, priceRub: 1990, note: "Для одного повара" },
  { id: "work", label: "Work", dishes: 50, priceRub: null, note: "Для кухни с большим меню" },
];

export const DEFAULT_PLAN: ChefPlan = "free";

export const isChefPlan = (v: unknown): v is ChefPlan => CHEF_PLANS.some((p) => p.id === v);

export const planOf = (v: unknown) => CHEF_PLANS.find((p) => p.id === v) ?? CHEF_PLANS[0]!;

/** Цена для показа: «Бесплатно», «1 990 ₽» или «цена уточняется». */
export const planPrice = (p: { priceRub: number | null }) =>
  p.priceRub === null ? "цена уточняется" : p.priceRub === 0 ? "Бесплатно" : `${p.priceRub.toLocaleString("ru-RU").replace(/[\u00a0\u202f]/g, " ")} ₽`;
