/**
 * База знаний AI-агента. Ничего не хранится отдельно: при каждом запросе знания собираются из тех же
 * источников, из которых сайт показывает данные, поэтому новое попадает к агенту сразу:
 *  - заведения: топ Москвы и партии из seed/top250 (после новой партии нужен перезапуск сервера), точки OpenStreetMap;
 *  - рецепты: seed/recipes/editorial.json читается при каждом запросе, рецепты поваров берутся из базы;
 *  - частые вопросы и разделы сайта: из src/lib/faq.ts;
 *  - повара, блюда, эфиры: из базы (ищутся в самом маршруте ассистента).
 * Только на сервере.
 */
import { FAQ } from "./faq";
import { listEditorial } from "./recipes-editorial";
import { brandSummary, matchBrands, matchOsm, osmSummary } from "./venues/assistant";
import { venueProvider } from "./venues/data";

export type KnowledgeHit = {
  type: "faq" | "page" | "recipe" | "venue" | "osm";
  id: string;
  title: string;
  subtitle: string;
  href: string;
  score: number;
  /** Факты для ответа: их читает Claude или из них собирается ответ без него. */
  text: string;
};

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е");

/** Служебные слова запроса: не должны давать совпадений. */
const STOP = new Set(
  "как что где для при это или про мне меня мой моя мои мою есть можно нужно надо какой какая какие какое чтобы если когда также очень еще хочу подскажи расскажи покажи дай нет все вот его она оно они там тут здесь чем тоже быть будет были был была работает работать сделать".split(" "),
);

/** Слова-названия разделов: в запросе они ничего не говорят о том, какой именно рецепт или заведение нужен. */
const GENERIC = new Set("рецепт рецепты рецепта рецепту рецептов блюдо блюда заведение заведения ресторан ресторана повар повара поваров шеф шефа".split(" "));

/** Значимые слова запроса без служебных. */
export const queryWords = (query: string): string[] => norm(query).split(/[^a-zа-я0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));

/** Совпадение слов запроса с текстом: целое слово +2, основа (без двух последних букв) +1. */
export function scoreText(query: string, haystack: string, strict = false): number {
  const h = norm(haystack);
  let s = 0;
  for (const word of queryWords(query)) {
    if (strict && GENERIC.has(word)) continue;
    if (h.includes(word)) s += 2;
    else if (word.length > 4 && h.includes(word.slice(0, word.length - 2))) s += 1;
  }
  return s;
}

const VENUE_INTENT = /ресторан|кафе|бар|паб|кофейн|пекарн|столов|пиццери|бургер|шаурм|адрес|заведени|где поесть|где выпить|часы работы/;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** Частые вопросы, разделы сайта и рецепты из открытых источников. Не обращается к базе. */
export function searchStatic(query: string): KnowledgeHit[] {
  const hits: KnowledgeHit[] = [];
  // Если в запросе есть конкретные слова («омлет», «сканер»), общие слова-разделы («рецепт», «блюдо») совпадений не дают
  const strict = queryWords(query).some((w) => !GENERIC.has(w));

  for (const g of FAQ) {
    const gs = scoreText(query, g.title, strict);
    if (gs > 0) hits.push({ type: "page", id: g.id, title: g.title, subtitle: "Раздел сайта", href: g.href, score: gs + 1, text: `Раздел «${g.title}»: ${g.items.map((i) => i.q).join("; ")}.` });
    for (const it of g.items) {
      // слова из самого вопроса весомее слов из ответа
      const s = scoreText(query, `${it.q} ${it.a}`, strict) + scoreText(query, it.q, strict);
      if (s >= 2) hits.push({ type: "faq", id: `${g.id}:${it.q}`, title: it.q, subtitle: `Вопросы · ${g.title}`, href: `/faq#faq-${g.id}`, score: s, text: it.a });
    }
  }

  for (const r of listEditorial()) {
    const s = scoreText(query, `${r.title} ${r.author} ${r.tags} ${r.from ?? ""} ${r.description} ${r.ingredients.join(" ")}`, strict) + 2 * scoreText(query, `${r.title} ${r.author}`, true);
    if (s >= 2) {
      hits.push({
        type: "recipe",
        id: r.slug,
        title: r.title,
        subtitle: `Рецепт · ${r.author}`,
        href: `/recipes/e/${r.slug}`,
        score: s + 0.5,
        text: `Рецепт «${r.title}» (${r.author}${r.from ? `, ${r.from}` : ""}). ${r.description} Ингредиенты: ${clip(r.ingredients.join("; "), 280)}. Источник: ${r.source.name}, ${r.source.url}`,
      });
    }
  }
  return hits;
}

/** Заведения: по названию (точное совпадение весомее), по описанию, кухне и меню, затем точки OpenStreetMap. */
export function searchVenues(query: string): KnowledgeHit[] {
  const hits: KnowledgeHit[] = [];
  const exact = matchBrands(query);
  const exactIds = new Set(exact.map((b) => b.id));
  for (const b of exact) {
    hits.push({ type: "venue", id: b.id, title: b.name, subtitle: `Заведение · ${b.cuisine}`, href: `/venues#b-${b.id}`, score: 12, text: brandSummary(b) });
  }
  for (const b of venueProvider.listBrands()) {
    if (exactIds.has(b.id)) continue;
    const s = scoreText(query, `${b.name} ${b.cuisine} ${b.info.join(" ")} ${b.menuTheses.join(" ")}`);
    if (s >= 3) hits.push({ type: "venue", id: b.id, title: b.name, subtitle: `Заведение · ${b.cuisine}`, href: `/venues#b-${b.id}`, score: s, text: brandSummary(b) });
  }
  if (exact.length === 0 && VENUE_INTENT.test(norm(query))) {
    for (const v of matchOsm(query, new Set())) {
      hits.push({ type: "osm", id: v.id, title: v.name, subtitle: `${v.kindLabel}${v.address ? ` · ${v.address}` : ""}`, href: `/map?osm=${encodeURIComponent(v.id)}`, score: 4, text: osmSummary(v) });
    }
  }
  return hits;
}

/** Всё найденное по запросу, лучшие первыми. */
export function searchKnowledge(query: string, limit = 6): KnowledgeHit[] {
  const all = [...searchStatic(query), ...searchVenues(query)].sort((a, b) => b.score - a.score);
  if (all.length === 0) return [];
  // слабые совпадения рядом с сильным не показываем: только то, что хотя бы вполовину так же уместно
  const floor = Math.max(2, all[0]!.score * 0.5);
  return all.filter((h) => h.score >= floor).slice(0, limit);
}
