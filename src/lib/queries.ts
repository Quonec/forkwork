import { db } from "./db";
import type { ChefCard, Dish, Recipe, StreamInfo } from "./types";

// node:sqlite возвращает строки с null-прототипом — такие объекты нельзя
// передавать из серверных компонентов в клиентские, поэтому приводим к плоским
const toPlain = <T>(row: unknown): T => ({ ...(row as Record<string, unknown>) }) as T;
const allPlain = <T>(rows: unknown[]): T[] => rows.map((r) => toPlain<T>(r));

const CHEF_SELECT = `
SELECT c.id, c.user_id AS userId, u.name, u.avatar, c.bio, c.specialization,
  c.cuisine_id AS cuisineId, cu.name AS cuisineName, cu.emoji AS cuisineEmoji,
  c.lat, c.lng, c.address, c.price_level AS priceLevel, c.available, c.delivery, c.pickup,
  c.work_hours AS workHours,
  COALESCE((SELECT ROUND(AVG(rating),1) FROM reviews r WHERE r.chef_id = c.id AND r.status='visible'),0) AS rating,
  (SELECT COUNT(*) FROM reviews r WHERE r.chef_id = c.id AND r.status='visible') AS reviewsCount,
  (SELECT s.id FROM streams s WHERE s.chef_id = c.id AND s.status='live' LIMIT 1) AS liveStreamId,
  (SELECT COUNT(*) FROM dishes d WHERE d.chef_id = c.id AND d.available=1) AS dishesCount
FROM chefs c
JOIN users u ON u.id = c.user_id
LEFT JOIN cuisines cu ON cu.id = c.cuisine_id
WHERE u.blocked = 0`;

export function listChefs(): ChefCard[] {
  return allPlain<ChefCard>(db.prepare(`${CHEF_SELECT} ORDER BY rating DESC, reviewsCount DESC`).all());
}

export function getChef(id: number): ChefCard | null {
  const row = db.prepare(`${CHEF_SELECT} AND c.id = ?`).get(id);
  return row ? toPlain<ChefCard>(row) : null;
}

export function listDishes(chefId: number, onlyAvailable = true): Dish[] {
  return allPlain<Dish>(
    db
      .prepare(
        `SELECT id, chef_id AS chefId, name, description, price, emoji, tags, available
         FROM dishes WHERE chef_id = ? ${onlyAvailable ? "AND available = 1" : ""} ORDER BY id`
      )
      .all(chefId)
  );
}

export function getDishesByIds(ids: number[]): Dish[] {
  if (ids.length === 0) return [];
  const ph = ids.map(() => "?").join(",");
  return allPlain<Dish>(
    db
      .prepare(
        `SELECT id, chef_id AS chefId, name, description, price, emoji, tags, available
         FROM dishes WHERE id IN (${ph})`
      )
      .all(...ids)
  );
}

type RecipeRow = Omit<Recipe, "ingredients" | "steps"> & { ingredients: string; steps: string };

const parseRecipe = (r: RecipeRow): Recipe => ({
  ...r,
  ingredients: JSON.parse(r.ingredients),
  steps: JSON.parse(r.steps),
});

export function listRecipes(): Recipe[] {
  const rows = db
    .prepare(
      `SELECT r.id, r.chef_id AS chefId, r.title, r.description, r.time_min AS timeMin,
        r.difficulty, r.emoji, r.ingredients, r.steps, r.tags, u.name AS chefName, u.avatar AS chefAvatar
       FROM recipes r JOIN chefs c ON c.id = r.chef_id JOIN users u ON u.id = c.user_id
       ORDER BY r.id DESC`
    )
    .all() as unknown as RecipeRow[];
  return rows.map(parseRecipe);
}

export function getRecipe(id: number): Recipe | null {
  const row = db
    .prepare(
      `SELECT r.id, r.chef_id AS chefId, r.title, r.description, r.time_min AS timeMin,
        r.difficulty, r.emoji, r.ingredients, r.steps, r.tags, u.name AS chefName, u.avatar AS chefAvatar
       FROM recipes r JOIN chefs c ON c.id = r.chef_id JOIN users u ON u.id = c.user_id
       WHERE r.id = ?`
    )
    .get(id) as unknown as RecipeRow | undefined;
  return row ? parseRecipe(row) : null;
}

type StreamRow = Omit<StreamInfo, "dishIds"> & { dishIds: string };

const parseStream = (s: StreamRow): StreamInfo => ({ ...s, dishIds: JSON.parse(s.dishIds) });

const STREAM_SELECT = `
SELECT s.id, s.chef_id AS chefId, s.title, s.status, s.scheduled_at AS scheduledAt,
  s.started_at AS startedAt, s.viewers, s.dish_ids AS dishIds, s.pinned_message AS pinnedMessage,
  s.tags, u.name AS chefName, u.avatar AS chefAvatar, cu.name AS cuisineName
FROM streams s
JOIN chefs c ON c.id = s.chef_id
JOIN users u ON u.id = c.user_id
LEFT JOIN cuisines cu ON cu.id = c.cuisine_id`;

export function listStreams(): StreamInfo[] {
  const rows = db
    .prepare(
      `${STREAM_SELECT}
       ORDER BY CASE s.status WHEN 'live' THEN 0 WHEN 'scheduled' THEN 1 ELSE 2 END, s.viewers DESC`
    )
    .all() as unknown as StreamRow[];
  return rows.map(parseStream);
}

export function getStream(id: number): StreamInfo | null {
  const row = db.prepare(`${STREAM_SELECT} WHERE s.id = ?`).get(id) as unknown as StreamRow | undefined;
  return row ? parseStream(row) : null;
}

export type ReviewView = {
  id: number;
  rating: number;
  text: string;
  chefReply: string;
  createdAt: string;
  authorName: string;
  authorAvatar: string;
  status: string;
};

export function listChefReviews(chefId: number, includeHidden = false): ReviewView[] {
  return allPlain<ReviewView>(
    db
      .prepare(
        `SELECT r.id, r.rating, r.text, r.chef_reply AS chefReply, r.created_at AS createdAt,
          u.name AS authorName, u.avatar AS authorAvatar, r.status
         FROM reviews r JOIN users u ON u.id = r.author_id
         WHERE r.chef_id = ? ${includeHidden ? "" : "AND r.status = 'visible'"}
         ORDER BY r.created_at DESC`
      )
      .all(chefId)
  );
}

export function listCuisines() {
  return allPlain<{ id: number; name: string; emoji: string }>(
    db.prepare("SELECT id, name, emoji FROM cuisines ORDER BY id").all()
  );
}

export function logEvent(type: string, userId: number | null, meta: object = {}) {
  db.prepare("INSERT INTO events (type, user_id, meta, created_at) VALUES (?,?,?,?)").run(
    type,
    userId,
    JSON.stringify(meta),
    new Date().toISOString()
  );
}
