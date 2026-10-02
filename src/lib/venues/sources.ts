/**
 * Источники оценок заведения. Для каждого заведения даём шесть площадок с
 * готовой ссылкой на поиск этого заведения. Число звёзд мы показываем только
 * там, где реально прочитали его со страницы; на остальных оценку не
 * выдумываем, а отправляем смотреть по ссылке.
 */
export type RatingSource = { id: string; source: string; url: string };

export function ratingSources(name: string, address: string): RatingSource[] {
  const q = encodeURIComponent(`${name} ${address} Москва`.trim());
  const n = encodeURIComponent(`${name} Москва`);
  return [
    { id: "yandex", source: "Яндекс Карты", url: `https://yandex.ru/maps/?text=${q}` },
    { id: "2gis", source: "2ГИС", url: `https://2gis.ru/moscow/search/${encodeURIComponent(name)}` },
    { id: "google", source: "Google Карты", url: `https://www.google.com/maps/search/?api=1&query=${q}` },
    { id: "flamp", source: "Фламп", url: `https://moscow.flamp.ru/search/${encodeURIComponent(name)}` },
    { id: "zoon", source: "Zoon", url: `https://zoon.ru/search/?city=msk&query=${encodeURIComponent(name)}` },
    { id: "tripadvisor", source: "TripAdvisor", url: `https://www.tripadvisor.ru/Search?q=${n}` },
  ];
}

/** Читаем ли мы известную оценку этого источника: сопоставляем по началу названия. */
export const MATCH: Record<string, string[]> = {
  yandex: ["Яндекс"],
  "2gis": ["2ГИС"],
  google: ["Google"],
  flamp: ["Фламп", "Flamp"],
  zoon: ["Zoon"],
  tripadvisor: ["TripAdvisor"],
};

/** Цвет источника: звёзды каждой площадки закрашены своим цветом, чтобы источник читался без подписи. */
const COLORS: [string, string][] = [
  ["Яндекс", "#e8381f"],
  ["2ГИС", "#16a34a"],
  ["Google", "#2f6fe4"],
  ["Фламп", "#d6246e"],
  ["Flamp", "#d6246e"],
  ["Zoon", "#0891b2"],
  ["TripAdvisor", "#0d9488"],
  ["Отзовик", "#f97316"],
  ["Irecommend", "#7c3aed"],
  ["Ваш досуг", "#92400e"],
];
export const sourceColor = (source: string): string => COLORS.find(([k]) => source.startsWith(k))?.[1] ?? "#1c1917";
