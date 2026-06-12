import { db, nowIso } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { json, err } from "@/lib/api";

// Скрипт «живой аудитории»: создаёт эффект активного эфира в демо-режиме
const BOT_SCRIPT: [string, string][] = [
  ["Гость_42", "Выглядит аппетитно! 😍"],
  ["foodie_msk", "А какая температура плиты сейчас?"],
  ["Марина К.", "Только что оформила заказ, жду 🤤"],
  ["gourmet77", "🔥🔥🔥"],
  ["Олег П.", "Подскажите, можно заменить один ингредиент?"],
  ["Светлана", "Где покупаете такие специи?"],
  ["kulinar_pro", "Класс! Добавил повара в избранное"],
  ["Дима", "Сколько ещё по времени до готовности?"],
  ["Настя 🌱", "Есть ли веганская версия этого блюда?"],
  ["шеф_дома", "Уровень! Учусь у вас 👏"],
];
const BOT_INTERVAL_SEC = 40;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const streamId = Number(id);
  const stream = db
    .prepare("SELECT id, status, started_at AS startedAt, viewers, bot_cursor AS botCursor FROM streams WHERE id = ?")
    .get(streamId) as { id: number; status: string; startedAt: string | null; viewers: number; botCursor: number } | undefined;
  if (!stream) return err("Стрим не найден", 404);

  // Подкидываем сообщения «зрителей» по расписанию, пока эфир идёт
  if (stream.status === "live" && stream.startedAt) {
    const elapsedSec = (Date.now() - new Date(stream.startedAt).getTime()) / 1000;
    const due = Math.min(Math.floor(elapsedSec / BOT_INTERVAL_SEC), 60);
    if (due > stream.botCursor) {
      const ins = db.prepare(
        "INSERT INTO stream_messages (stream_id, user_id, author_name, text, kind, created_at) VALUES (?,NULL,?,?,'msg',?)"
      );
      for (let i = stream.botCursor; i < due; i++) {
        const [name, text] = BOT_SCRIPT[(streamId * 3 + i) % BOT_SCRIPT.length];
        const at = new Date(new Date(stream.startedAt).getTime() + (i + 1) * BOT_INTERVAL_SEC * 1000).toISOString();
        ins.run(streamId, name, text, at);
      }
      db.prepare("UPDATE streams SET bot_cursor = ? WHERE id = ?").run(due, streamId);
    }
  }

  const messages = db
    .prepare(
      `SELECT id, user_id AS userId, author_name AS authorName, text, kind, created_at AS createdAt
       FROM stream_messages WHERE stream_id = ? ORDER BY created_at DESC LIMIT 80`
    )
    .all(streamId)
    .reverse();

  // Лёгкое «дыхание» счётчика зрителей
  const wobble = stream.status === "live" ? Math.round(6 * Math.sin(Date.now() / 25_000)) : 0;
  return json({ messages, viewers: Math.max(0, stream.viewers + wobble), status: stream.status });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return err("Войдите, чтобы писать в чат", 401);
  const { id } = await ctx.params;
  const streamId = Number(id);
  const stream = db.prepare("SELECT id, status FROM streams WHERE id = ?").get(streamId) as
    | { id: number; status: string }
    | undefined;
  if (!stream) return err("Стрим не найден", 404);
  if (stream.status !== "live") return err("Эфир не идёт — чат закрыт");

  const body = await req.json().catch(() => null);
  const kind = body?.kind === "reaction" ? "reaction" : "msg";
  const text = String(body?.text ?? "").trim().slice(0, 500);
  if (!text) return err("Пустое сообщение");

  db.prepare(
    "INSERT INTO stream_messages (stream_id, user_id, author_name, text, kind, created_at) VALUES (?,?,?,?,?,?)"
  ).run(streamId, user.id, user.name, text, kind, nowIso());
  return json({ ok: true });
}
