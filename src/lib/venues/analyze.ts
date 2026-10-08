/**
 * Разбор недельного дневника: доли БЖУ, завтраки, разброс по дням, и общие
 * подсказки, на что смотреть в меню любого заведения. Чистые функции, без базы
 * и сети. Ориентиры по долям БЖУ — широкие справочные диапазоны для взрослых
 * (белок 10–35 %, жиры 20–35 %, углеводы 45–65 % калорий), а не медицинская
 * рекомендация. Конкретных блюд и калорий заведений здесь нет: их меню живёт
 * на сайтах заведений, и мы ничего не выдумываем за них.
 */
import type { DiaryWeek, Meal } from "@/lib/scan/diary";

export const RANGES = {
  protein: { min: 10, max: 35 },
  fat: { min: 20, max: 35 },
  carbs: { min: 45, max: 65 },
} as const;

const FEW_DAYS = 3;

type Macros = { proteinMg: number; fatMg: number; carbsMg: number };

/** Калории от макронутриентов (4/9/4 ккал на грамм) и их доли в процентах. */
export function macroShares(m: Macros): { protein: number; fat: number; carbs: number } | null {
  const p = (m.proteinMg / 1000) * 4;
  const f = (m.fatMg / 1000) * 9;
  const c = (m.carbsMg / 1000) * 4;
  const total = p + f + c;
  if (total <= 0) return null;
  return { protein: (p / total) * 100, fat: (f / total) * 100, carbs: (c / total) * 100 };
}

export type Flag =
  | "few_days"
  | "protein_low"
  | "protein_high"
  | "fat_low"
  | "fat_high"
  | "carbs_low"
  | "carbs_high"
  | "no_breakfast"
  | "uneven";

export type WeekAnalysis = {
  weekStart: string;
  daysLogged: number;
  scans: number;
  avgKcalPerDay: number;
  avgMealKcal: number;
  shares: { protein: number; fat: number; carbs: number } | null;
  meals: Record<Meal, number>;
  flags: Flag[];
};

export type Insight = { tone: "ok" | "watch" | "info"; text: string };
export type Tip = { title: string; text: string };

export function analyzeWeek(week: DiaryWeek): WeekAnalysis {
  const logged = week.days.filter((d) => d.scans.length > 0);
  const meals: Record<Meal, number> = { Завтрак: 0, Обед: 0, Ужин: 0, Перекус: 0 };
  for (const d of logged) for (const s of d.scans) meals[s.meal]++;
  const shares = macroShares(week.totals);
  const flags: Flag[] = [];
  if (logged.length < FEW_DAYS) flags.push("few_days");
  if (shares && week.totals.scans >= 2) {
    if (shares.protein < RANGES.protein.min) flags.push("protein_low");
    if (shares.protein > RANGES.protein.max) flags.push("protein_high");
    if (shares.fat < RANGES.fat.min) flags.push("fat_low");
    if (shares.fat > RANGES.fat.max) flags.push("fat_high");
    if (shares.carbs < RANGES.carbs.min) flags.push("carbs_low");
    if (shares.carbs > RANGES.carbs.max) flags.push("carbs_high");
  }
  if (week.totals.scans >= 3 && meals.Завтрак === 0) flags.push("no_breakfast");
  const kcals = logged.map((d) => d.kcal);
  if (kcals.length >= 3 && Math.max(...kcals) > 2 * Math.min(...kcals)) flags.push("uneven");
  return {
    weekStart: week.weekStart,
    daysLogged: logged.length,
    scans: week.totals.scans,
    avgKcalPerDay: week.avgKcal,
    avgMealKcal: week.totals.scans > 0 ? Math.round(week.totals.kcal / week.totals.scans) : 0,
    shares,
    meals,
    flags,
  };
}

const pct = (n: number) => `${Math.round(n)} %`;

export function buildInsights(a: WeekAnalysis): Insight[] {
  const out: Insight[] = [];
  if (a.scans === 0) {
    return [{ tone: "info", text: "На этой неделе сканов нет. Сфотографируйте несколько приёмов пищи, и разбор станет точнее." }];
  }
  out.push({
    tone: "info",
    text: `В дневнике ${a.scans} приём(ов) пищи за ${a.daysLogged} дн., в среднем ≈${a.avgKcalPerDay} ккал в день, когда вы сканировали, и ≈${a.avgMealKcal} ккал на приём.`,
  });
  if (a.flags.includes("few_days")) {
    out.push({ tone: "watch", text: `Отмечено меньше ${FEW_DAYS} дней, поэтому выводы приблизительные.` });
  }
  if (a.shares) {
    const s = a.shares;
    out.push({
      tone: "info",
      text: `Доли калорий: белки ${pct(s.protein)}, жиры ${pct(s.fat)}, углеводы ${pct(s.carbs)}. Ориентиры: белки 10–35 %, жиры 20–35 %, углеводы 45–65 %.`,
    });
    const off = a.flags.some((f) => f.endsWith("_low") || f.endsWith("_high"));
    if (a.flags.includes("protein_low")) out.push({ tone: "watch", text: "Белка мало относительно ориентира." });
    if (a.flags.includes("protein_high")) out.push({ tone: "watch", text: "Белка больше ориентира." });
    if (a.flags.includes("fat_high")) out.push({ tone: "watch", text: "Жиров больше ориентира." });
    if (a.flags.includes("fat_low")) out.push({ tone: "watch", text: "Жиров меньше ориентира." });
    if (a.flags.includes("carbs_high")) out.push({ tone: "watch", text: "Углеводов больше ориентира." });
    if (a.flags.includes("carbs_low")) out.push({ tone: "watch", text: "Углеводов меньше ориентира." });
    if (!off && a.scans >= 2) out.push({ tone: "ok", text: "Соотношение белков, жиров и углеводов в пределах ориентиров." });
  }
  if (a.flags.includes("no_breakfast")) out.push({ tone: "watch", text: "Завтраков в дневнике нет." });
  if (a.flags.includes("uneven")) out.push({ tone: "watch", text: "Калорийность по дням сильно скачет: разница больше чем вдвое." });
  return out;
}

const TIPS: Partial<Record<Flag, Tip>> = {
  protein_low: { title: "Добавьте белок", text: "В меню ищите блюда с рыбой, птицей, яйцом, творогом или бобовыми и берите их как основу приёма." },
  protein_high: { title: "Разбавьте белок", text: "Добавьте к основному блюду овощи и гарнир из круп, фрукты на десерт." },
  fat_high: { title: "Меньше жира", text: "Выбирайте блюда варёные, на пару, запечённые или приготовленные на гриле; жареное, сливочные соусы и колбасы берите реже." },
  fat_low: { title: "Добавьте полезные жиры", text: "Рыба, орехи и растительное масло в заправке помогут вернуть долю жиров к ориентиру." },
  carbs_high: { title: "Меньше быстрых углеводов", text: "Замените выпечку, сладкие напитки и десерты на блюдо с белком и овощным гарниром." },
  carbs_low: { title: "Добавьте углеводов", text: "Каши, картофель, цельнозерновой хлеб и фрукты вернут долю углеводов к ориентиру." },
  no_breakfast: { title: "Начните с завтрака", text: "Посмотрите в меню раздел завтраков: каша, омлет или творог с ягодами." },
  uneven: { title: "Ровнее по дням", text: "Лучше три-четыре приёма пищи средней порции, чем один большой после долгого перерыва." },
  few_days: { title: "Сканируйте чаще", text: "Чем больше приёмов пищи в дневнике, тем точнее разбор. Хватит пары сканов в день." },
};

const DEFAULT_TIP: Tip = { title: "Собирайте тарелку", text: "В любом меню хорошо работает сочетание: источник белка, овощи и порция гарнира." };

/** Общие подсказки по меню для флагов недели; без флагов — базовая. Не привязаны к конкретному заведению. */
export function buildTips(a: WeekAnalysis): Tip[] {
  const tips = a.flags.map((f) => TIPS[f]).filter((t): t is Tip => Boolean(t));
  return tips.length > 0 ? tips : [DEFAULT_TIP];
}
