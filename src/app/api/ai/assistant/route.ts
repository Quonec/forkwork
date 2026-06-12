import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { json, err } from "@/lib/api";

// AI-агент ForkWork: подбирает поваров, блюда, стримы и рецепты под запрос.
// Рекомендации считаются детерминированной эвристикой (работает офлайн);
// текст ответа генерирует Claude, если задан ANTHROPIC_API_KEY, иначе — шаблон.

type Rec = { type: "chef" | "dish" | "stream" | "recipe"; id: number; title: string; subtitle: string; emoji: string; href: string; score: number };

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е");

function score(query: string, haystack: string): number {
  const q = norm(query);
  const h = norm(haystack);
  let s = 0;
  for (const word of q.split(/[^a-zа-я0-9]+/).filter((w) => w.length > 2)) {
    if (h.includes(word)) s += 2;
    else if (word.length > 4 && h.includes(word.slice(0, word.length - 2))) s += 1;
  }
  return s;
}

function buildRecommendations(query: string): Rec[] {
  const recs: Rec[] = [];
  const chefs = db.prepare(
    `SELECT c.id, u.name, u.avatar, c.specialization, c.bio, cu.name AS cuisine,
      COALESCE((SELECT ROUND(AVG(rating),1) FROM reviews r WHERE r.chef_id=c.id AND r.status='visible'),0) AS rating
     FROM chefs c JOIN users u ON u.id=c.user_id LEFT JOIN cuisines cu ON cu.id=c.cuisine_id WHERE u.blocked=0`
  ).all() as unknown as { id: number; name: string; avatar: string; specialization: string; bio: string; cuisine: string | null; rating: number }[];
  for (const c of chefs) {
    const s = score(query, `${c.name} ${c.specialization} ${c.bio} ${c.cuisine ?? ""}`) + c.rating / 5;
    if (s > 1) recs.push({ type: "chef", id: c.id, title: c.name, subtitle: `${c.cuisine ?? "Кухня"} · рейтинг ${c.rating}`, emoji: c.avatar, href: `/chefs/${c.id}`, score: s });
  }
  const dishes = db.prepare(
    `SELECT d.id, d.name, d.description, d.tags, d.price, d.emoji, d.chef_id AS chefId, u.name AS chefName
     FROM dishes d JOIN chefs c ON c.id=d.chef_id JOIN users u ON u.id=c.user_id WHERE d.available=1`
  ).all() as unknown as { id: number; name: string; description: string; tags: string; price: number; emoji: string; chefId: number; chefName: string }[];
  for (const d of dishes) {
    const s = score(query, `${d.name} ${d.description} ${d.tags}`);
    if (s > 0) recs.push({ type: "dish", id: d.id, title: d.name, subtitle: `${d.price} FC · ${d.chefName}`, emoji: d.emoji, href: `/chefs/${d.chefId}`, score: s });
  }
  const streams = db.prepare(
    `SELECT s.id, s.title, s.tags, s.status, u.name AS chefName
     FROM streams s JOIN chefs c ON c.id=s.chef_id JOIN users u ON u.id=c.user_id WHERE s.status IN ('live','scheduled')`
  ).all() as unknown as { id: number; title: string; tags: string; status: string; chefName: string }[];
  for (const st of streams) {
    const s = score(query, `${st.title} ${st.tags}`) + (st.status === "live" ? 1 : 0);
    if (s > 1) recs.push({ type: "stream", id: st.id, title: st.title, subtitle: st.status === "live" ? `В эфире · ${st.chefName}` : `Скоро · ${st.chefName}`, emoji: "", href: `/streams/${st.id}`, score: s });
  }
  const recipes = db.prepare(`SELECT id, title, tags, emoji, time_min AS timeMin FROM recipes`).all() as unknown as { id: number; title: string; tags: string; emoji: string; timeMin: number }[];
  for (const r of recipes) {
    const s = score(query, `${r.title} ${r.tags}`);
    if (s > 0) recs.push({ type: "recipe", id: r.id, title: r.title, subtitle: `Рецепт · ${r.timeMin} мин`, emoji: r.emoji, href: `/recipes/${r.id}`, score: s });
  }
  return recs.sort((a, b) => b.score - a.score).slice(0, 6);
}

function fallbackPopular(): Rec[] {
  const live = db.prepare(
    `SELECT s.id, s.title, u.name AS chefName FROM streams s
     JOIN chefs c ON c.id=s.chef_id JOIN users u ON u.id=c.user_id
     WHERE s.status='live' ORDER BY s.viewers DESC LIMIT 2`
  ).all() as unknown as { id: number; title: string; chefName: string }[];
  const top = db.prepare(
    `SELECT c.id, u.name, u.avatar, cu.name AS cuisine,
      COALESCE((SELECT ROUND(AVG(rating),1) FROM reviews r WHERE r.chef_id=c.id AND r.status='visible'),0) AS rating
     FROM chefs c JOIN users u ON u.id=c.user_id LEFT JOIN cuisines cu ON cu.id=c.cuisine_id
     WHERE u.blocked=0 ORDER BY rating DESC LIMIT 3`
  ).all() as unknown as { id: number; name: string; avatar: string; cuisine: string | null; rating: number }[];
  return [
    ...live.map((s, i): Rec => ({ type: "stream", id: s.id, title: s.title, subtitle: `В эфире · ${s.chefName}`, emoji: "", href: `/streams/${s.id}`, score: 10 - i })),
    ...top.map((c, i): Rec => ({ type: "chef", id: c.id, title: c.name, subtitle: `${c.cuisine ?? "Кухня"} · рейтинг ${c.rating}`, emoji: c.avatar, href: `/chefs/${c.id}`, score: 5 - i })),
  ];
}

function heuristicReply(query: string, recs: Rec[]): string {
  if (recs.length === 0)
    return "По вашему запросу я ничего точного не нашёл. Попробуйте сформулировать иначе — например, «острый суп», «веганский завтрак» или «итальянская паста». А пока посмотрите live-стримы: там всегда что-то готовится!";
  const names = recs.slice(0, 3).map((r) => `«${r.title}»`).join(", ");
  const liveCount = recs.filter((r) => r.type === "stream").length;
  let reply = `Вот что я подобрал по запросу «${query}»: ${names}.`;
  if (liveCount > 0) reply += " Обратите внимание — есть подходящий live-эфир, из него можно заказать блюдо в один клик.";
  reply += " Карточки ниже кликабельны.";
  return reply;
}

async function claudeReply(query: string, recs: Rec[]): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const client = new Anthropic();
    const catalog = recs.map((r) => `- [${r.type}] ${r.title} (${r.subtitle})`).join("\n");
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      system:
        "Ты — AI-агент гастрономической платформы ForkWork, которая соединяет домашних поваров и горожан (карта поваров, live-стримы готовки, заказ блюд, рецепты). Отвечай по-русски, дружелюбно и кратко (2-4 предложения). Тебе дают запрос пользователя и список подобранных платформой рекомендаций — прокомментируй их и помоги выбрать. Не выдумывай блюда и поваров вне списка. Не принимай финансовых решений за пользователя.",
      messages: [
        { role: "user", content: `Запрос пользователя: «${query}»\n\nПодобранные рекомендации:\n${catalog || "(ничего не найдено)"}` },
      ],
    });
    const block = response.content.find((b) => b.type === "text");
    return block && block.type === "text" ? block.text : null;
  } catch {
    return null; // при сбое внешнего API тихо откатываемся на эвристику
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const query = String(body?.query ?? "").trim().slice(0, 300);
  if (!query) return err("Пустой запрос");

  const matched = buildRecommendations(query);
  const recs = matched.length > 0 ? matched : fallbackPopular();
  const ai = await claudeReply(query, recs);
  return json({
    reply: ai ?? heuristicReply(query, matched),
    recommendations: recs,
    engine: ai ? "claude" : "heuristic",
  });
}
