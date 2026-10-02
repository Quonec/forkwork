/**
 * Weekly diary maths. A diary day is a Moscow calendar day (UTC+3 all year, the
 * same zone the scanner's dates use); a week runs Monday to Sunday. Dates are
 * plain `YYYY-MM-DD` strings so no local-time surprises leak in.
 */
const MSK_OFFSET_MS = 3 * 3_600_000;
const DAY_MS = 86_400_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type Meal = "Завтрак" | "Обед" | "Ужин" | "Перекус";

export const mskDate = (d: Date): string => new Date(d.getTime() + MSK_OFFSET_MS).toISOString().slice(0, 10);

export function isValidDate(s: string | null | undefined): s is string {
  if (!s || !DATE_RE.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s;
}

export function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** The Monday of the week that holds `date`. */
export function weekStartOf(date: string): string {
  const dow = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(date, -dow);
}

/** The UTC instants that bound the Moscow week starting on `weekStart`: [from, to). */
export function weekRangeUtc(weekStart: string): { from: Date; to: Date } {
  const from = new Date(Date.parse(`${weekStart}T00:00:00Z`) - MSK_OFFSET_MS);
  return { from, to: new Date(from.getTime() + 7 * DAY_MS) };
}

/** A meal by the Moscow hour of the scan: 05–10 завтрак, 11–15 обед, 17–21 ужин, the rest перекус. */
export function mealOf(d: Date): Meal {
  const hour = new Date(d.getTime() + MSK_OFFSET_MS).getUTCHours();
  if (hour >= 5 && hour <= 10) return "Завтрак";
  if (hour >= 11 && hour <= 15) return "Обед";
  if (hour >= 17 && hour <= 21) return "Ужин";
  return "Перекус";
}

export type DiaryScan = {
  id: string;
  createdAt: string;
  thumb: boolean;
  headline: string | null;
  moreCount: number;
  grams: number;
  kcal: number;
  proteinMg: number;
  fatMg: number;
  carbsMg: number;
};

export type DiaryDay = {
  date: string;
  kcal: number;
  proteinMg: number;
  fatMg: number;
  carbsMg: number;
  scans: (DiaryScan & { meal: Meal })[];
};

export type DiaryWeek = {
  weekStart: string;
  weekEnd: string;
  prevWeek: string;
  nextWeek: string | null;
  isCurrent: boolean;
  today: string;
  days: DiaryDay[];
  totals: { kcal: number; proteinMg: number; fatMg: number; carbsMg: number; scans: number };
  /** Average kcal per day that has at least one scan; 0 for an empty week. */
  avgKcal: number;
};

export function buildWeek(weekStart: string, scans: DiaryScan[], now: Date = new Date()): DiaryWeek {
  const today = mskDate(now);
  const days: DiaryDay[] = Array.from({ length: 7 }, (_, i) => ({
    date: addDays(weekStart, i),
    kcal: 0,
    proteinMg: 0,
    fatMg: 0,
    carbsMg: 0,
    scans: [],
  }));
  for (const s of scans) {
    const at = new Date(s.createdAt);
    const day = days.find((d) => d.date === mskDate(at));
    if (!day) continue;
    day.scans.push({ ...s, meal: mealOf(at) });
    day.kcal += s.kcal;
    day.proteinMg += s.proteinMg;
    day.fatMg += s.fatMg;
    day.carbsMg += s.carbsMg;
  }
  const totals = days.reduce(
    (a, d) => ({
      kcal: a.kcal + d.kcal,
      proteinMg: a.proteinMg + d.proteinMg,
      fatMg: a.fatMg + d.fatMg,
      carbsMg: a.carbsMg + d.carbsMg,
      scans: a.scans + d.scans.length,
    }),
    { kcal: 0, proteinMg: 0, fatMg: 0, carbsMg: 0, scans: 0 },
  );
  const filled = days.filter((d) => d.scans.length > 0).length;
  const currentWeek = weekStartOf(today);
  return {
    weekStart,
    weekEnd: addDays(weekStart, 6),
    prevWeek: addDays(weekStart, -7),
    nextWeek: weekStart >= currentWeek ? null : addDays(weekStart, 7),
    isCurrent: weekStart === currentWeek,
    today,
    days,
    totals,
    avgKcal: filled > 0 ? Math.round(totals.kcal / filled) : 0,
  };
}
