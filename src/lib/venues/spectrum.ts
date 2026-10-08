/** Спектр звёзд: чистые функции без обращений к базе, их можно подключать и в клиентском коде. */
import type { Rating } from "./types";

const fmt = (n: number) => String(n).replace(".", ",");

export type StarItem = {
  source: string;
  url: string;
  stars: number;
  raw: string;
  count?: string;
  /** Число оценок или отзывов из подписи источника; null — у рецензии критика его нет. */
  votes: number | null;
  period: string;
  kind: Rating["kind"];
  note?: string;
};

export type Spectrum = { min: number; max: number; count: number; items: StarItem[] };

export const starsOf = (r: Pick<Rating, "value" | "scale">): number => Math.round((r.value / r.scale) * 5 * 10) / 10;

/** Первое число в подписи («15 325 оценок, 6 051 отзыв» → 15325, «40+ отзывов» → 40). */
export function votesOf(count: string | undefined): number | null {
  const m = count?.match(/\d[\d\s ]*/);
  if (!m) return null;
  const n = Number(m[0].replace(/[\s ]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function spectrumOf(ratings: Rating[]): Spectrum | null {
  if (ratings.length === 0) return null;
  const items: StarItem[] = ratings
    .map((r) => ({
      source: r.source,
      url: r.url,
      stars: starsOf(r),
      raw: `${fmt(r.value)} из ${r.scale}`,
      count: r.count,
      votes: r.kind === "критик" ? null : votesOf(r.count),
      period: r.period,
      kind: r.kind,
      note: r.note,
    }))
    .sort((a, b) => a.stars - b.stars);
  return { min: items[0]!.stars, max: items[items.length - 1]!.stars, count: items.length, items };
}

