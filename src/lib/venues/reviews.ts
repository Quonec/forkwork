/**
 * Отдельные отзывы гостей: фрагменты, прочитанные на страницах источников
 * 2026-10-01 (2ГИС, Яндекс Карты, Отзовик, Irecommend, Ваш досуг). Автор, дата и
 * звёзды приведены так, как показаны на странице; даты и звёзд нет там, где
 * источник их не показывает. Тональность: по звёздам источника, а где их нет,
 * по смыслу текста (это наша пометка). Эмодзи и подписи без текста не берём.
 */
import { MORE_REVIEWS } from "./more";
import { TOP_REVIEWS } from "./top25";

export type ReviewTone = "+" | "±" | "-";

export type VenueReview = {
  source: string;
  url: string;
  author: string;
  date?: string;
  /** Звёзды, поставленные автором (1–5), если страница их показывает. */
  stars?: number;
  text: string;
  tone: ReviewTone;
  /** Язык фрагмента, если не русский. */
  lang?: "en";
  /** Отзыв относится ко всей сети, а не к одной точке. */
  chain?: boolean;
};

const G2 = (id: string) => `https://2gis.ru/moscow/firm/${id}/tab/reviews`;
const r = (source: string, url: string, author: string, text: string, tone: ReviewTone, extra: Partial<VenueReview> = {}): VenueReview => ({ source, url, author, text, tone, ...extra });

const PUSHKIN_2GIS = G2("4504127908559765");
const PUSHKIN_YA = "https://yandex.com/maps/org/kafe_pushkin/1018907821/reviews/";
const PUSHKIN_OTZ = "https://otzovik.com/reviews/restoran_pushkin_russia_moscow/";
export const POINT_REVIEWS: Record<string, VenueReview[]> = {
  ...TOP_REVIEWS,
  ...MORE_REVIEWS,
  pushkin: [
    r("2ГИС", PUSHKIN_2GIS, "Деятель Искусств", "Визит в ресторан «Кафе Пушкинъ» с первых же секунд превращается в настоящее путешествие во времени.", "+"),
    r("2ГИС", PUSHKIN_2GIS, "Ольга Ольхонская", "красивый интерьер, красивая подача, живая музыка.", "+"),
    r("2ГИС", PUSHKIN_2GIS, "Тот Самый", "Это место с особой атмосферой, где гармонично сочетаются изысканный интерьер, высокий уровень сервиса.", "+"),
    r("2ГИС", PUSHKIN_2GIS, "неля я", "персонал очень вежливый, атмосферно и безумно вкусно", "+"),
    r("2ГИС", PUSHKIN_2GIS, "Анна С.", "Атмосфера, очень вкусно!", "+"),
    r("2ГИС", PUSHKIN_2GIS, "Авель", "Очень красивый интерьер! Просто замечательный!", "+"),
    r("Яндекс Карты", PUSHKIN_YA, "Farouq Aldilaijan", "Great ambiance being in a building that old.", "+", { date: "16 июля 2025", lang: "en" }),
    r("Яндекс Карты", PUSHKIN_YA, "Kawthar Kadhem", "The place is a piece of art and will take you to that decade", "+", { date: "13 июля 2025", lang: "en" }),
    r("Яндекс Карты", PUSHKIN_YA, "Manssor Alanazi", "A fine dining restaurant that offers a luxurious experience", "+", { date: "4 октября 2024", lang: "en" }),
    r("Яндекс Карты", PUSHKIN_YA, "Jabroot Khatib", "I like the hospitality of staff and that they're bilingual", "+", { date: "26 декабря 2024", lang: "en" }),
    r("Яндекс Карты", PUSHKIN_YA, "Ashwani Gupta", "Racist receptionist and staff.", "-", { date: "9 сентября 2025", lang: "en" }),
    r("Отзовик", PUSHKIN_OTZ, "lepale007", "Он расположен в самом центре, в 5 минутах от метро Тверская.", "+", { date: "12 февраля 2025", stars: 5 }),
    r("Отзовик", PUSHKIN_OTZ, "Oksanapets", "Позвала подруга на день рождения, сама бы я с оплатой комнаты сюда не выбралась.", "+", { date: "24 сентября 2026", stars: 5 }),
    r("Отзовик", PUSHKIN_OTZ, "cogitatio", "Декорации создавали художники Мосфильма.", "+", { date: "2 июля 2026", stars: 4 }),
    r("Отзовик", PUSHKIN_OTZ, "muringa", "Это самый красивый Ресторан Москвы передающий одноименную атмосферу того времени.", "+", { date: "28 марта 2023", stars: 5 }),
    r("Отзовик", PUSHKIN_OTZ, "iris5000", "Ресторан можно смело причислять к достопримечательностям Москвы.", "+", { date: "15 января 2018", stars: 5 }),
  ],
};

/** Отзывы по сети (на всех её точках): добавляются к отзывам точки. */
export const BRAND_REVIEWS: Record<string, VenueReview[]> = {};

export function reviewsFor(venueId: string, brandId: string): VenueReview[] {
  return [...(POINT_REVIEWS[venueId] ?? []), ...(BRAND_REVIEWS[brandId] ?? [])];
}

export { reviewStats, type ReviewStats } from "./reviewstats";
