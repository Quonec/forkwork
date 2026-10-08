/**
 * Спектр звёзд: оценки заведения с разных источников, приведённые к шкале 5.
 * Это не среднее и не «правильный» рейтинг: оценки карт, сайтов отзывов и
 * критиков получены разными аудиториями и несопоставимы строго.
 */
import { BRAND_CUISINES, cuisineFacts } from "./cuisine";
import { MORE_CHEFS, MORE_PHOTOS } from "./more";
import { CHEFS, SEGMENT_OVERRIDES, SOURCE_PHOTOS, type ChefFact, type SourcePhotos } from "./top25-extra";
import { estimateSegment, segmentLabel, segmentOfCheck, SEGMENT_BASIS_LABEL, themeLabel, themesFrom, type SegmentBasis } from "./themes";
import { formatMetro, nearestMetro } from "./metro";
import { reviewsFor, reviewStats, type ReviewStats, type VenueReview } from "./reviews";
import { spectrumOf, type Spectrum } from "./spectrum";
import type { Brand, Venue } from "./types";

export { spectrumOf, starsOf, votesOf, type Spectrum, type StarItem } from "./spectrum";

/** Точка из набора заведений: факты, факты о кухне, спектр звёзд и отзывы. */
export type VenueDto = Venue & {
  facts: string[];
  cuisineFacts: string[];
  /** Ключи кухонь заведения: по ним работает фильтр по кухне. */
  cuisineKeys: string[];
  /** Повара на кухне по публикациям, у каждого факта ссылка на источник. */
  chefs: ChefFact[];
  /** Фото о заведении на картах (число с их страниц). */
  sourcePhotos: SourcePhotos[];
  /** Тематика по ключам кухни заведения. */
  themes: { id: string; label: string }[];
  /** Ценовой сегмент: по среднему чеку, по данным источника или оценка по виду. */
  segment: { id: string; label: string; basis: SegmentBasis; note: string };
  spectrum: Spectrum | null;
  reviews: VenueReview[];
  reviewStats: ReviewStats;
};

function segmentOf(v: Venue): VenueDto["segment"] {
  const make = (id: string, basis: SegmentBasis) => ({ id, label: segmentLabel(id), basis, note: SEGMENT_BASIS_LABEL[basis] });
  if (v.avgCheck) return make(segmentOfCheck(v.avgCheck.rub), "check");
  const over = SEGMENT_OVERRIDES.find((o) => o.id === v.id);
  if (over) return make(over.segment, "source");
  return make(estimateSegment("restaurant", [], []), "type");
}

export function venueDto(v: Venue, brand: Brand | undefined): VenueDto {
  const facts: string[] = [];
  if (brand) facts.push(`${brand.cuisine}`);
  facts.push(`Адрес: ${v.address}`);
  if (v.avgCheck) facts.push(`Средний чек: ${v.avgCheck.text}`);
  const m = nearestMetro(v.lat, v.lng);
  if (m) facts.push(formatMetro(m));
  facts.push(v.hours ? `Часы работы: ${v.hours}` : "Часы работы: на сайте заведения");
  const all = [...(v.ratings ?? []), ...(brand?.ratings ?? [])];
  const reviews = reviewsFor(v.id, v.brandId);
  return {
    ...v,
    facts,
    cuisineFacts: cuisineFacts(BRAND_CUISINES[v.brandId] ?? [], "restaurant"),
    cuisineKeys: BRAND_CUISINES[v.brandId] ?? [],
    chefs: CHEFS[v.id] ?? MORE_CHEFS[v.id] ?? [],
    sourcePhotos: SOURCE_PHOTOS[v.id] ?? MORE_PHOTOS[v.id] ?? [],
    themes: themesFrom(BRAND_CUISINES[v.brandId] ?? [], "restaurant", v.name).ids.map((id) => ({ id, label: themeLabel(id) })),
    segment: segmentOf(v),
    spectrum: spectrumOf(all),
    reviews,
    reviewStats: reviewStats(reviews),
  };
}
