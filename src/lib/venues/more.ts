/**
 * Ещё заведения из топа Москвы: данные лежат в seed/top250/*.json (по одной партии
 * на файл), координаты в seed/top250/coords.json. Заведения собраны из нескольких
 * общедоступных рейтингов (WHERETOEAT 2025, топ-50 Restorating 2022–2025, Forbes,
 * Great List, РБК Вино, Яндекс Путеводитель); у каждого в карточке названо, из каких.
 *
 * Оценки, число оценок, отзывы и число фото прочитаны на страницах 2ГИС и Яндекс Карт
 * (даты чтения в самих карточках); повара названы по публикациям со ссылкой. Только на
 * сервере: читает файлы.
 */
import fs from "node:fs";
import path from "node:path";

import type { VenueReview } from "./reviews";
import type { Brand, GuestSource, Rating, Venue } from "./types";
import type { AvgCheck, ChefFact, SourcePhotos } from "./top25-extra";

type Tone = "+" | "±" | "-";
type R = [author: string, date: string, tone: Tone, text: string, lang?: "en"];
type G2 = { id: string; value: number; count: string; photos?: number | null; reviews: R[] };
type Ya = { path: string; value: number | null; count: string; photos?: number | null; reviews: R[] };

export type MoreEntry = {
  id: string;
  name: string;
  address: string;
  hours?: string | null;
  website?: string;
  src: string;
  cuisine: string;
  keys: string[];
  info: string[];
  menu: string[];
  g2?: G2 | null;
  ya?: Ya | null;
  chefs?: ([text: string, url: string] | ChefFact)[];
  check?: [rub: number, text: string] | null;
  /** Прочитано (по умолчанию дата последнего чтения партии). */
  read?: string;
};

const DIR = path.join(process.cwd(), "seed", "top250");
const PERIOD = "прочитано 2026-10-02";

function load(): { entries: MoreEntry[]; coords: Record<string, [number, number]> } {
  if (!fs.existsSync(DIR)) return { entries: [], coords: {} };
  const files = fs.readdirSync(DIR).filter((f) => /^batch-.*\.json$/.test(f)).sort();
  const seen = new Set<string>();
  const entries: MoreEntry[] = [];
  for (const f of files) {
    for (const e of JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")) as MoreEntry[]) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      entries.push(e);
    }
  }
  const cf = path.join(DIR, "coords.json");
  const coords = fs.existsSync(cf) ? (JSON.parse(fs.readFileSync(cf, "utf8")) as Record<string, [number, number]>) : {};
  return { entries, coords };
}

const { entries, coords } = load();
/** Только заведения с координатами: без них точку не на что поставить. */
const ready = entries.filter((e) => coords[e.id]);

const g2Reviews = (id: string) => `https://2gis.ru/moscow/firm/${id}/tab/reviews`;
const yaReviews = (p: string) => `https://yandex.com/maps/org/${p}/reviews/`;

const sources = (e: MoreEntry): { source: string; url: string; value: number | null; count: string; reviews: R[] }[] => [
  ...(e.g2 ? [{ source: "2ГИС", url: g2Reviews(e.g2.id), value: e.g2.value, count: e.g2.count, reviews: e.g2.reviews }] : []),
  ...(e.ya ? [{ source: "Яндекс Карты", url: yaReviews(e.ya.path), value: e.ya.value, count: e.ya.count, reviews: e.ya.reviews }] : []),
];

const rating = (s: { source: string; url: string; value: number | null; count: string }): Rating => ({
  source: s.source, url: s.url, value: s.value ?? 0, scale: 5, count: s.count, period: PERIOD, kind: "карты",
});

const review = (source: string, url: string, [author, date, tone, text, lang]: R): VenueReview => ({
  source, url, author, ...(date ? { date } : {}), text, tone, ...(lang ? { lang } : {}),
});

const guest = (s: { source: string; url: string; value: number | null; count: string; reviews: R[] }): GuestSource => ({
  source: s.source,
  url: s.url,
  period: PERIOD,
  rating: s.value === null ? s.count : `${String(s.value).replace(".", ",")} из 5 · ${s.count}`,
  positives: s.reviews.filter((r) => r[2] === "+").slice(0, 3).map((r) => r[3]),
  negatives: s.reviews.filter((r) => r[2] === "-").slice(0, 2).map((r) => r[3]),
});

const menuUrl = (e: MoreEntry): string =>
  e.website ? e.website : e.g2 ? `https://2gis.ru/moscow/firm/${e.g2.id}/tab/menu` : e.ya ? `https://yandex.com/maps/org/${e.ya.path}/menu/` : "";

export const MORE_VENUES: Venue[] = ready.map((e) => {
  const c = coords[e.id]!;
  const check: AvgCheck | undefined = e.check
    ? { rub: e.check[0], text: e.check[1], url: e.g2 ? `https://2gis.ru/moscow/firm/${e.g2.id}` : e.ya ? `https://yandex.com/maps/org/${e.ya.path}/` : "" }
    : undefined;
  return {
    id: e.id,
    brandId: e.id,
    name: e.name,
    address: e.address,
    lat: c[0],
    lng: c[1],
    hours: e.hours ?? null,
    website: e.website ?? "",
    menuUrl: menuUrl(e),
    ratings: sources(e).filter((s) => s.value !== null).map(rating),
    ...(check ? { avgCheck: check } : {}),
  };
});

export const MORE_BRANDS: Brand[] = ready.map((e) => ({
  id: e.id,
  name: e.name,
  cuisine: e.cuisine,
  info: [`Входит в подборки лучших ресторанов Москвы: ${e.src}.`, ...e.info],
  menuTheses: e.menu,
  guestSources: sources(e).filter((s) => s.reviews.length > 0).map(guest),
  ratings: [],
  menu: {
    summary: e.website ? `Меню на официальном сайте: ${e.website}` : "Своего сайта с меню в открытых источниках не нашлось, меню смотрите на странице заведения в 2ГИС или на Яндекс Картах.",
  },
  reviews: [],
  noReviewsNote: "Профессиональных рецензий в источниках не искали: оценки и отзывы гостей взяты с 2ГИС и Яндекс Карт.",
}));

export const MORE_REVIEWS: Record<string, VenueReview[]> = Object.fromEntries(
  ready.map((e) => [e.id, sources(e).flatMap((s) => s.reviews.map((r) => review(s.source, s.url, r)))]),
);

export const MORE_CUISINES: Record<string, string[]> = Object.fromEntries(ready.map((e) => [e.id, e.keys]));

export const MORE_ALIASES: Record<string, string[]> = Object.fromEntries(
  ready.map((e) => [e.id, [e.name.toLowerCase().replace(/\s*\/.*$/, "")]]),
);

export const MORE_CHEFS: Record<string, ChefFact[]> = Object.fromEntries(ready.map((e) => [e.id, (e.chefs ?? []).map((c) => (Array.isArray(c) ? { text: c[0], url: c[1] } : c))]));

export const MORE_PHOTOS: Record<string, SourcePhotos[]> = Object.fromEntries(
  ready.map((e) => [
    e.id,
    [
      ...(e.g2 && typeof e.g2.photos === "number" ? [{ source: "2ГИС", url: `https://2gis.ru/moscow/gallery/firm/${e.g2.id}`, count: e.g2.photos }] : []),
      ...(e.ya && typeof e.ya.photos === "number" ? [{ source: "Яндекс Карты", url: `https://yandex.com/maps/org/${e.ya.path}/gallery/`, count: e.ya.photos }] : []),
    ],
  ]),
);

/** Сколько заведений прочитано и сколько из них уже с координатами. */
export const MORE_STATS = { entries: entries.length, ready: ready.length };
