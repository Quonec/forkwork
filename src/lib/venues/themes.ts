/**
 * Тематика и ценовой сегмент заведения. Чистые функции без обращений к базе:
 * их используют и сервер (при подготовке базы), и страницы.
 *
 * Тематика берётся из тега кухни OpenStreetMap; если тега нет, из названия
 * («Кофейня…», «Пицца…», «Шаурма…»); если нет и этого, из вида заведения (бары
 * и пабы). Что из этого сработало, записывается в basis, чтобы не выдавать
 * догадку по названию за данные карты.
 *
 * Ценовой сегмент строится по среднему чеку, где он известен из источников
 * (2ГИС, страницы заведений). Там, где чека нет, сегмент оценивается по виду
 * заведения (фастфуд и кофе навынос — эконом, остальные — средний) и помечается
 * как оценка: это не данные, а ориентир.
 */
import { OSM_CATEGORIES } from "./categories";

export type ThemeBasis = "tag" | "name" | "kind" | "none";
export type SegmentBasis = "check" | "source" | "type";

export const SEGMENTS: { id: string; label: string; range: string; min: number; max: number }[] = [
  { id: "low", label: "Эконом", range: "до 500 ₽", min: 0, max: 500 },
  { id: "mid", label: "Средний", range: "500–1 500 ₽", min: 501, max: 1500 },
  { id: "high", label: "Выше среднего", range: "1 500–3 000 ₽", min: 1501, max: 3000 },
  { id: "top", label: "Премиум", range: "от 3 000 ₽", min: 3001, max: 10_000_000 },
];

export const segmentLabel = (id: string): string => SEGMENTS.find((s) => s.id === id)?.label ?? "";
export const segmentOfCheck = (rub: number): string => SEGMENTS.find((s) => rub >= s.min && rub <= s.max)?.id ?? "";

export const SEGMENT_BASIS_LABEL: Record<SegmentBasis, string> = {
  check: "по среднему чеку из источника",
  source: "по данным источника (не по чеку)",
  type: "оценка по виду заведения",
};

/** Признаки по названию: срабатывают только если у заведения нет тега кухни. */
const NAME_PATTERNS: [string, RegExp][] = [
  ["coffee", /кофе|coffee|кофейн|espresso|эспрессо|пекарн|булочн|хлеб|bakery|кондитер|десерт|торт|морожен|пончик|donut|bчайb|чайная|bteab|круассан/i],
  ["pizza", /пицц|pizza/i],
  ["sushi", /суши|sushi|ролл|роллы|вок\b|wok|рамен|ramen|японск/i],
  ["burger", /бургер|burger|стрит|хот-?дог|hot ?dog|крылышк|chicken|курица|картошк/i],
  ["shawarma", /шаурм|shawarma|кебаб|kebab|донер|doner|шаверм/i],
  ["caucasian", /хинкал|хачапур|грузин|кавказ|шашлык|мангал|чайхан|узбек|плов|армян|аджар|самарканд|ташкент|\bбаку\b|тбилиси|тифлис|ереван|бухара|хива|кахет|сулугуни|харчо|мцхет|сакартвел|дагестан|осетин|кавказ/i],
  ["italian", /итальян|trattoria|траттория|osteria|остерия|pasta|паста|ristorante|\bрим\b|милан|неаполь|венеци|тоскан|сицили|верона|\bпарма\b|болонь|амальфи|капри|bottega|ботега|пиццери/i],
  ["asian", /китай|thai|тай\b|вьетнам|\bфо\b|pho|корей|азиат|noodle|лапш|dim ?sum|дим-?сам|индийск|шанхай|пекин|токио|осака|сайгон|ханой|бангкок|сингапур|гонконг|будда|самурай|сакура|нипон|тануки|якитори|якитория|мумий/i],
  ["seafood", /рыб|море|устриц|oyster|seafood|fish|краб|лобстер|осьминог|креветк|раки\b/i],
  ["steak", /стейк|steak|гриль|grill|bbq|барбекю/i],
  ["russian", /русск|столов|блин|пельмен|борщ|пирожк|домашн|харчевн|трактир|самовар|\bизба\b|терем|купец|русь|тройка|сибир|боярин|кулинарн|гастроном/i],
  ["bar", /\bбар\b|\bpub\b|\bпаб\b|пивн|beer|brewery|пивовар|\bwine\b|винн/i],
];

export function themesFrom(tags: string[], kind: string, name: string): { ids: string[]; basis: ThemeBasis } {
  const byTag = OSM_CATEGORIES.filter((c) => c.tags.some((t) => tags.includes(t))).map((c) => c.id);
  const kindBar = kind === "bar" || kind === "pub" || kind === "biergarten" ? ["bar"] : [];
  if (byTag.length > 0) return { ids: [...new Set([...byTag, ...kindBar])], basis: "tag" };
  const byName = NAME_PATTERNS.filter(([, re]) => re.test(name)).map(([id]) => id);
  if (byName.length > 0) return { ids: [...new Set([...byName, ...kindBar])], basis: "name" };
  if (kindBar.length > 0) return { ids: kindBar, basis: "kind" };
  return { ids: [], basis: "none" };
}

export const themeLabel = (id: string): string => OSM_CATEGORIES.find((c) => c.id === id)?.label ?? id;

const CHEAP_TAGS = ["coffee_shop", "bubble_tea", "donut", "ice_cream", "hot_dog", "shawarma", "sandwich", "potato", "pie", "crepe", "bakery", "tea", "burger", "chicken", "sausage", "deli"];

/** Оценка сегмента по виду заведения: фастфуд, фудкорт и кофе навынос — эконом, остальное — средний. */
export function estimateSegment(kind: string, tags: string[], themes: string[]): string {
  if (kind === "fast_food" || kind === "food_court") return "low";
  if (tags.some((t) => CHEAP_TAGS.includes(t))) return "low";
  if (themes.includes("coffee") && kind === "cafe") return "low";
  return "mid";
}
