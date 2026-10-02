/**
 * ИИ-помощник сканера КБЖУ по заведениям. Отвечает только по тому, что у нас
 * есть: недельный дневник пользователя, описание заведений, меню тезисами,
 * мнения критиков и отзывы гостей по источникам. Если данных нет, так и
 * говорит и даёт ссылку. Ответ пишет Claude при заданном ANTHROPIC_API_KEY,
 * иначе собирается из тех же фактов без ИИ.
 */
import Anthropic from "@anthropic-ai/sdk";

import { analyzeFor } from "./advice";
import { venueProvider } from "./data";
import { MORE_ALIASES } from "./more";
import { TOP_ALIASES } from "./top25";
import { fold, searchOsmVenues, type OsmVenue } from "./osm";
import { spectrumOf } from "./ratings";
import { reviewsFor, reviewStats, type VenueReview } from "./reviews";
import type { Brand, Rating, Venue } from "./types";

export type AssistantSource = { title: string; url: string };
export type AssistantAnswer = {
  answer: string;
  sources: AssistantSource[];
  engine: "claude" | "heuristic";
  matched: { brands: string[]; osm: string[] };
};

const ALIASES: Record<string, string[]> = {
  pushkin: ["пушкин"],
  ...Object.fromEntries(Object.entries({ ...TOP_ALIASES, ...MORE_ALIASES }).map(([id, names]) => [id, names.map(fold)])),
};

const STOP = new Set([
  "что", "какие", "какой", "какая", "есть", "меню", "отзывы", "отзыв", "критики", "критик", "посоветуй", "посоветуйте", "дневник", "дневнику",
  "неделя", "неделю", "заведения", "заведение", "ресторан", "рестораны", "кафе", "москва", "москве", "блюда", "блюдо", "калории", "белок", "жиры",
  "углеводы", "мнения", "пишут", "расскажи", "расскажите", "про", "где", "как", "для", "мне", "моему", "моей", "можно", "лучше", "хочу", "поесть",
]);

const INTENT = {
  reviews: /отзыв|критик|рецензи|мнени|пишут|оценк|хвал|ругаю|рейтинг/,
  menu: /меню|блюд|заказат|состав|кбжу|калор|что есть|что взять|что поесть/,
  info: /адрес|час[аы]|работает|открыт|чек|цен[аыу]|дорог|сколько|шеф|формат|где /,
  plan: /дневник|недел|белок|белк|жир|углевод|посоветуй|что выбрать|диет|похуд|набрать|рацион|подход/,
};

const tokens = (q: string) => fold(q).split(/[^а-яa-z0-9]+/).filter((w) => w.length >= 4 && !STOP.has(w));

function matchBrands(q: string): Brand[] {
  const f = fold(q);
  return venueProvider.listBrands().filter((b) => (ALIASES[b.id] ?? [fold(b.name)]).some((a) => f.includes(a)));
}

function matchOsm(q: string, skipTokens: Set<string>): OsmVenue[] {
  const words = tokens(q).filter((w) => !skipTokens.has(w)).sort((a, b) => b.length - a.length);
  for (const w of words.slice(0, 3)) {
    const res = searchOsmVenues({ q: w, limit: 3, offset: 0, withWebsite: true });
    if (res.total > 0 && res.total <= 40) return res.venues;
  }
  return [];
}

const searchUrl = (v: OsmVenue) => `https://yandex.ru/search/?text=${encodeURIComponent(`${v.name} ${v.address} Москва отзывы меню`.trim())}`;

const shortPlace = (v: Venue) => v.address.replace(/^ул\.\s*/, "");

/** Все оценки бренда и его точек: звёзды в шкале 5 с источником, периодом и числом оценок. */
function ratingLines(b: Brand, places: Venue[]): { line: string; stars: number }[] {
  const entries: { r: Rating; where?: string }[] = [...b.ratings.map((r) => ({ r })), ...places.flatMap((p) => (p.ratings ?? []).map((r) => ({ r, where: shortPlace(p) })))];
  return entries
    .map(({ r, where }) => {
      const s = spectrumOf([r])!.items[0]!;
      return { stars: s.stars, line: `${r.source}${where ? ` (${where})` : ""}: ${r.scale === 5 ? s.raw : `${s.raw} (${String(s.stars).replace(".", ",")} из 5)`}${r.count ? `, ${r.count}` : ""}, ${r.period}${r.kind === "критик" ? ", оценка критика" : ""}` };
    })
    .sort((x, y) => x.stars - y.stars);
}

/** Отзывы точек бренда без повторов (отзывы сети входят в каждую точку). */
function brandReviews(b: Brand, places: Venue[]): VenueReview[] {
  const seen = new Set<string>();
  const out: VenueReview[] = [];
  for (const p of places) {
    for (const r of reviewsFor(p.id, b.id)) {
      const key = r.url + r.author + r.text;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(r);
      }
    }
  }
  return out;
}

/** До пяти отзывов для ответа: сначала положительные и критические вперемешку, чтобы картина была честной. */
function pickReviews(list: VenueReview[], n = 5): VenueReview[] {
  const plus = list.filter((r) => r.tone === "+");
  const minus = list.filter((r) => r.tone === "-");
  const mixed = list.filter((r) => r.tone === "±");
  const out: VenueReview[] = [];
  for (let i = 0; out.length < n && i < 10; i++) {
    for (const g of [plus, minus, mixed]) if (g[i] && out.length < n) out.push(g[i]!);
  }
  return out;
}

const quote = (r: VenueReview) =>
  `${r.tone === "+" ? "[+]" : r.tone === "-" ? "[−]" : "[±]"} ${r.author}, ${r.source}${r.date ? `, ${r.date}` : ""}${r.stars ? `, ${r.stars}★` : ""}: «${r.text}»`;

function brandFacts(b: Brand, places: Venue[]) {
  return {
    заведение: b.name,
    кухня: b.cuisine,
    адреса: places.map((p) => `${p.address}${p.hours ? ` (${p.hours})` : ""}`),
    о_заведении: b.info,
    меню_тезисами: b.menuTheses,
    критики: b.reviews.map((r) => ({ издание: r.outlet, автор: r.author, дата: r.date, о_чём: r.about, вывод: r.verdict, цитата: r.quote })),
    отзывы_гостей: b.guestSources.map((g) => ({ источник: g.source, период: g.period, оценка: g.rating, плюсы: g.positives, минусы: g.negatives, примечание: g.note })),
    звёзды_с_источников: ratingLines(b, places).map((x) => x.line),
    отзывы_по_точкам: { сводка: reviewStats(brandReviews(b, places)), примеры: pickReviews(brandReviews(b, places), 8).map(quote) },
    критиков_не_найдено: b.reviews.length === 0 ? b.noReviewsNote ?? "рецензий критиков не найдено" : undefined,
    ссылки: { сайт: places[0]?.website, меню: places[0]?.menuUrl },
  };
}

function osmFacts(v: OsmVenue) {
  return {
    заведение: v.name,
    вид: v.kindLabel,
    кухня: v.cuisine,
    адрес: v.address || undefined,
    часы: v.hours || undefined,
    сайт: v.website || undefined,
    меню_на_сайте: v.menuUrl || undefined,
    отзывов_и_меню_в_нашей_базе: "нет, только то, что указано на карте OpenStreetMap",
  };
}

function heuristic(
  q: string,
  brands: Brand[],
  places: Venue[],
  osm: OsmVenue[],
  tips: { title: string; text: string }[],
  hasWeek: boolean,
): string {
  const f = fold(q);
  const any = Object.values(INTENT).some((r) => r.test(f));
  const want = {
    reviews: INTENT.reviews.test(f) || !any,
    menu: INTENT.menu.test(f) || !any,
    info: INTENT.info.test(f) || !any,
  };
  const out: string[] = [];
  for (const b of brands) {
    const ps = places.filter((p) => p.brandId === b.id);
    out.push(`${b.name} (${b.cuisine})`);
    if (want.info) out.push(...b.info.slice(0, 3).map((t) => `• ${t}`));
    const kbzhu = b.menuTheses.find((t) => t.startsWith("Для питания по КБЖУ"));
    const plain = b.menuTheses.filter((t) => t !== kbzhu);
    if (want.menu) out.push("Меню тезисами:", ...plain.slice(0, 4).map((t) => `• ${t}`));
    if ((want.menu || INTENT.plan.test(f)) && kbzhu) out.push(`С учётом дневника: ${kbzhu.replace("Для питания по КБЖУ: ", "")}`);
    if (want.reviews) {
      const stars = ratingLines(b, ps);
      if (stars.length > 0) {
        const lo = stars[0]!.stars;
        const hi = stars[stars.length - 1]!.stars;
        out.push(`Звёзды с источников (разброс ${String(lo).replace(".", ",")}–${String(hi).replace(".", ",")} из 5):`, ...stars.map((x) => `• ${x.line}`));
      }
      const all = brandReviews(b, ps);
      if (all.length > 0) {
        const st = reviewStats(all);
        out.push(`Отзывы гостей: всего ${st.total} из ${st.sources} источников (положительных ${st.plus}, смешанных ${st.mixed}, критических ${st.minus}). Примеры:`, ...pickReviews(all, 5).map((r) => `• ${quote(r)}`));
      }
      if (b.reviews.length > 0) out.push("Критики:", ...b.reviews.map((r) => `• ${r.outlet}${r.author ? `, ${r.author}` : ""} (${r.date}): ${r.verdict}`));
      else if (b.noReviewsNote) out.push(`Критики: ${b.noReviewsNote}`);
      if (b.guestSources.length > 0)
        out.push("Гости:", ...b.guestSources.map((g) => `• ${g.source}${g.rating ? `, ${g.rating}` : ""}, ${g.period}. Хвалят: ${g.positives.join("; ") || "—"}. Ругают: ${g.negatives.join("; ") || "—"}.`));
    }
    if (ps[0]) out.push(`Меню на сайте: ${ps[0].menuUrl}`);
    out.push("");
  }
  for (const v of osm) {
    out.push(`${v.name} (${v.kindLabel}${v.cuisine.length ? `, ${v.cuisine.join(", ")}` : ""})`);
    if (v.address) out.push(`• Адрес: ${v.address}`);
    if (v.hours) out.push(`• Часы: ${v.hours}`);
    out.push(v.menuUrl ? `• Меню: ${v.menuUrl}` : v.website ? `• Сайт: ${v.website}` : "• Сайт на карте не указан");
    out.push("• Отзывов и меню у нас нет, только данные карты OpenStreetMap; поиск по отзывам и меню по ссылке ниже.", "");
  }
  if (brands.length === 0 && osm.length === 0 && !INTENT.plan.test(f)) {
    out.push("Конкретное заведение в вопросе я не нашёл.");
    out.push("У меня подробно описаны «Пушкинъ» и 25 заведений из подборки РБК Вино (например, Twins Garden, White Rabbit, Selfie, «Белуга»). Спросите, например: «Что в меню Selfie подходит под мой дневник?» или «Какие отзывы о «Турандоте»?».");
    out.push("");
  }
  if (brands.length === 0 && osm.length === 0 && INTENT.plan.test(f)) {
    out.push("Где и что взять (из описанных заведений, меню по ссылкам на их сайтах):");
    for (const br of venueProvider.listBrands()) {
      const k = br.menuTheses.find((t) => t.startsWith("Для питания по КБЖУ"));
      if (k) out.push(`• ${br.name}: ${k.replace("Для питания по КБЖУ: ", "")}`);
    }
    out.push("");
  }
  if (INTENT.plan.test(f) || (brands.length === 0 && osm.length === 0) || !hasWeek) {
    out.push(hasWeek ? "По вашему недельному дневнику:" : "Дневник этой недели пуст, поэтому общие подсказки:");
    out.push(...tips.slice(0, 3).map((t) => `• ${t.title}: ${t.text}`));
    out.push("Это справочные ориентиры, а не медицинская рекомендация.");
  }
  return out.join("\n").trim();
}

export async function askAssistant(ownerId: number, question: string, weekParam?: string): Promise<AssistantAnswer> {
  const q = question.trim().slice(0, 400);
  const venues = venueProvider.listVenues();
  const brands = matchBrands(q);
  const brandWords = new Set(brands.flatMap((b) => ALIASES[b.id] ?? []));
  const osm = brands.length === 0 ? matchOsm(q, brandWords) : [];
  const { analysis, insights, tips } = analyzeFor(ownerId, weekParam);
  const places = venues.filter((v) => brands.some((b) => b.id === v.brandId));

  const sources: AssistantSource[] = [];
  const addSrc = (title: string, url?: string) => url && !sources.some((s) => s.url === url) && sources.push({ title, url });
  for (const b of brands) {
    const ps = places.filter((p) => p.brandId === b.id);
    addSrc(`${b.name}: меню на сайте`, ps[0]?.menuUrl);
    for (const r of b.reviews) addSrc(`${r.outlet}${r.author ? `, ${r.author}` : ""}`, r.url);
    for (const g of b.guestSources) addSrc(g.source, g.url);
  }
  for (const v of osm) {
    addSrc(`${v.name}: ${v.menuUrl ? "меню" : v.website ? "сайт" : "поиск отзывов и меню"}`, v.menuUrl || v.website || searchUrl(v));
  }

  const engineAnswer = await claudeAnswer(q, {
    дневник_недели: { приёмов_пищи: analysis.scans, дней: analysis.daysLogged, ккал_в_день: analysis.avgKcalPerDay, доли_калорий_процент: analysis.shares && { белки: Math.round(analysis.shares.protein), жиры: Math.round(analysis.shares.fat), углеводы: Math.round(analysis.shares.carbs) }, выводы: insights.map((i) => i.text), подсказки: tips.map((t) => `${t.title}: ${t.text}`) },
    найденные_заведения: [...brands.map((b) => brandFacts(b, places.filter((p) => p.brandId === b.id))), ...osm.map(osmFacts)],
    доступные_подробные_описания: venueProvider.listBrands().map((b) => b.name),
  });
  return {
    answer: engineAnswer ?? heuristic(q, brands, places, osm, tips, analysis.scans > 0),
    sources: sources.slice(0, 8),
    engine: engineAnswer ? "claude" : "heuristic",
    matched: { brands: brands.map((b) => b.id), osm: osm.map((o) => o.id) },
  };
}

async function claudeAnswer(question: string, context: unknown): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
      system:
        "Ты — помощник по питанию в сканере КБЖУ приложения ForkWork и отвечаешь про заведения Москвы. Тебе дают вопрос пользователя и JSON с фактами: сводка его недельного дневника, описание заведений, меню тезисами, мнения критиков и отзывы гостей по источникам. Отвечай по-русски, по делу, до 150 слов, списком из коротких пунктов, когда уместно. Используй только факты из JSON: не выдумывай блюда, цены, калории и отзывы. Называй источник мнения (издание, автор или сайт) и год. Если данных нет, скажи об этом прямо и посоветуй открыть меню на сайте заведения. Когда советуешь блюда, привязывай совет к сводке дневника. Не ставь диагнозов и не давай медицинских советов; для цифр БЖУ напоминай, что это справочные ориентиры. Не используй восклицательные знаки.",
      messages: [{ role: "user", content: `Вопрос: ${question}\n\nФакты:\n${JSON.stringify(context)}` }],
    });
    const block = response.content.find((b) => b.type === "text");
    return block && block.type === "text" ? block.text : null;
  } catch {
    return null;
  }
}

/** Компактная база знаний о заведениях: можно отдавать ИИ как контекст для диалога. */
export function knowledgeBrief(): string {
  const venues = venueProvider.listVenues();
  return venueProvider
    .listBrands()
    .map((b) => {
      const ps = venues.filter((v) => v.brandId === b.id);
      const lines = [
        `# ${b.name} — ${b.cuisine}`,
        `Адреса: ${ps.map((p) => p.address).join("; ")}`,
        ...b.info.map((t) => `- ${t}`),
        "Меню тезисами:",
        ...b.menuTheses.map((t) => `- ${t}`),
        `Отзывы гостей: ${reviewStats(brandReviews(b, ps)).total} (положительных ${reviewStats(brandReviews(b, ps)).plus}, критических ${reviewStats(brandReviews(b, ps)).minus}); примеры:`,
        ...pickReviews(brandReviews(b, ps), 4).map((r) => `- ${quote(r)}`),
        "Звёзды с источников:",
        ...ratingLines(b, ps).map((x) => `- ${x.line}`),
        "Критики:",
        ...(b.reviews.length ? b.reviews.map((r) => `- ${r.outlet}${r.author ? `, ${r.author}` : ""} (${r.date}): ${r.verdict}`) : [`- ${b.noReviewsNote ?? "не найдены"}`]),
        "Отзывы гостей:",
        ...b.guestSources.map((g) => `- ${g.source} (${g.period}${g.rating ? `; ${g.rating}` : ""}): хвалят — ${g.positives.join("; ") || "—"}; ругают — ${g.negatives.join("; ") || "—"}`),
        `Ссылки: сайт ${ps[0]?.website}, меню ${ps[0]?.menuUrl}`,
      ];
      return lines.join("\n");
    })
    .join("\n\n");
}
