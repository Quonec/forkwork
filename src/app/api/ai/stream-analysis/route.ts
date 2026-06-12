import { db } from "@/lib/db";
import { json, err } from "@/lib/api";

// AI-агент: анализ гастрономического контента эфира (демо-симуляция).
// В проде здесь подключается видеоаналитика / мультимодальная модель;
// сейчас агент сопоставляет эфир с репертуаром повара детерминированно.

export async function GET(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("streamId"));
  const stream = db
    .prepare(
      `SELECT s.id, s.status, s.started_at AS startedAt, s.dish_ids AS dishIds, s.tags, s.title,
        c.id AS chefId, u.name AS chefName
       FROM streams s JOIN chefs c ON c.id = s.chef_id JOIN users u ON u.id = c.user_id WHERE s.id = ?`
    )
    .get(id) as { id: number; status: string; startedAt: string | null; dishIds: string; tags: string; title: string; chefId: number; chefName: string } | undefined;
  if (!stream) return err("Стрим не найден", 404);

  const dishIds: number[] = JSON.parse(stream.dishIds);
  const dishes = dishIds.length
    ? (db
        .prepare(
          `SELECT id, name, price, emoji FROM dishes WHERE id IN (${dishIds.map(() => "?").join(",")})`
        )
        .all(...dishIds) as unknown as { id: number; name: string; price: number; emoji: string }[]).map((d) => ({ ...d }))
    : [];

  const repertoire = db
    .prepare("SELECT COUNT(*) AS n FROM dishes WHERE chef_id = ? AND available = 1")
    .get(stream.chefId) as { n: number };

  if (stream.status !== "live" || !stream.startedAt || dishes.length === 0) {
    return json({
      live: false,
      tags: stream.tags.split(",").filter(Boolean),
      summary:
        stream.status === "scheduled"
          ? "Эфир ещё не начался. AI-агент подключится к анализу с первых минут трансляции."
          : "Эфир завершён. Аналитика доступна повару в кабинете.",
      detected: null,
      suggestions: dishes,
    });
  }

  // «Распознавание»: каждые 10 минут агент фиксирует следующее блюдо из подборки эфира
  const elapsedMin = Math.max(0, (Date.now() - new Date(stream.startedAt).getTime()) / 60_000);
  const idx = Math.floor(elapsedMin / 10) % dishes.length;
  const detected = dishes[idx];
  const confidence = 87 + ((stream.id * 7 + idx * 3) % 11); // стабильно «высокая уверенность» для демо

  return json({
    live: true,
    detected: { ...detected, confidence },
    summary: `Сейчас в кадре готовится «${detected.name}» (уверенность ${confidence}%). Блюдо найдено в репертуаре повара ${stream.chefName} — его можно заказать прямо из эфира.`,
    tags: stream.tags.split(",").filter(Boolean),
    repertoireMatch: { matched: dishes.length, total: repertoire.n },
    suggestions: dishes,
  });
}
