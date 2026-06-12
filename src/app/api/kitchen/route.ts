import { db, nowIso } from "@/lib/db";
import { json, err, requireUser, isResponse } from "@/lib/api";
import { listChefReviews } from "@/lib/queries";

function chefOf(userId: number) {
  return db.prepare("SELECT id FROM chefs WHERE user_id = ?").get(userId) as { id: number } | undefined;
}

const plainAll = (rows: unknown[]) => rows.map((r) => ({ ...(r as Record<string, unknown>) }));

export async function GET() {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const chef = chefOf(user.id);
  if (!chef) return err("Поварской кабинет доступен только поварам", 403);
  const chefId = chef.id;

  const profileRow = db
    .prepare(
      `SELECT c.id, c.bio, c.specialization, c.cuisine_id AS cuisineId, c.lat, c.lng, c.address,
        c.price_level AS priceLevel, c.available, c.delivery, c.pickup, c.work_hours AS workHours
       FROM chefs c WHERE c.id = ?`
    )
    .get(chefId) as Record<string, unknown>;
  const profile = { ...profileRow };
  const dishes = plainAll(
    db.prepare("SELECT id, name, description, price, emoji, tags, available FROM dishes WHERE chef_id = ? ORDER BY id DESC").all(chefId)
  );
  const recipes = plainAll(
    db.prepare("SELECT id, title, time_min AS timeMin, difficulty, emoji FROM recipes WHERE chef_id = ? ORDER BY id DESC").all(chefId)
  );
  const streams = plainAll(
    db
      .prepare(
        `SELECT id, title, status, scheduled_at AS scheduledAt, started_at AS startedAt, viewers,
          dish_ids AS dishIds, pinned_message AS pinnedMessage FROM streams WHERE chef_id = ?
         ORDER BY CASE status WHEN 'live' THEN 0 WHEN 'scheduled' THEN 1 ELSE 2 END, id DESC`
      )
      .all(chefId)
  );
  const orders = db
    .prepare(
      `SELECT o.id, o.status, o.items, o.total, o.fee, o.delivery_type AS deliveryType, o.address,
        o.source, o.created_at AS createdAt, u.name AS customerName
       FROM orders o JOIN users u ON u.id = o.customer_id
       WHERE o.chef_id = ? ORDER BY o.created_at DESC LIMIT 50`
    )
    .all(chefId)
    .map((o) => {
      const row = o as Record<string, unknown>;
      return { ...row, items: JSON.parse(String(row.items)) };
    });
  const chats = plainAll(
    db
      .prepare(
        `SELECT ch.id, ch.status, ch.created_at AS createdAt, u.name AS customerName, u.avatar AS customerAvatar
         FROM chats ch JOIN users u ON u.id = ch.customer_id WHERE ch.chef_id = ? ORDER BY ch.created_at DESC`
      )
      .all(chefId)
  );
  const reviews = listChefReviews(chefId, true);

  // Статистика кабинета
  const stat = (sql: string, ...p: (string | number)[]) =>
    (db.prepare(sql).get(...p) as Record<string, number>) ?? {};
  const revenue = stat(
    "SELECT COALESCE(SUM(total - fee),0) AS v FROM orders WHERE chef_id = ? AND status != 'cancelled'", chefId
  ).v;
  const ordersCount = stat("SELECT COUNT(*) AS v FROM orders WHERE chef_id = ?", chefId).v;
  const doneCount = stat("SELECT COUNT(*) AS v FROM orders WHERE chef_id = ? AND status = 'done'", chefId).v;
  const avgRating = stat(
    "SELECT COALESCE(ROUND(AVG(rating),1),0) AS v FROM reviews WHERE chef_id = ? AND status='visible'", chefId
  ).v;
  const streamViews = stat(
    "SELECT COALESCE(SUM(viewers),0) AS v FROM streams WHERE chef_id = ?", chefId
  ).v;
  const fromStream = stat(
    "SELECT COUNT(*) AS v FROM orders WHERE chef_id = ? AND source = 'stream'", chefId
  ).v;
  const avgCheck = ordersCount ? Math.round((stat(
    "SELECT COALESCE(AVG(total),0) AS v FROM orders WHERE chef_id = ? AND status != 'cancelled'", chefId
  ).v)) : 0;

  return json({
    profile, dishes, recipes, streams, orders, chats, reviews,
    stats: {
      revenue, ordersCount, doneCount, avgRating, streamViews, avgCheck,
      conversion: streamViews ? Math.round((fromStream / streamViews) * 1000) / 10 : 0,
      fromStream,
    },
  });
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const chef = chefOf(user.id);
  if (!chef) return err("Доступно только поварам", 403);
  const chefId = chef.id;
  const body = await req.json().catch(() => null);
  if (!body) return err("Некорректный запрос");
  const action = String(body.action ?? "");
  const t = nowIso();

  switch (action) {
    case "profile_update": {
      db.prepare(
        `UPDATE chefs SET bio = ?, specialization = ?, cuisine_id = ?, address = ?, lat = ?, lng = ?,
          price_level = ?, work_hours = ?, delivery = ?, pickup = ? WHERE id = ?`
      ).run(
        String(body.bio ?? "").slice(0, 600),
        String(body.specialization ?? "").slice(0, 100),
        body.cuisineId ? Number(body.cuisineId) : null,
        String(body.address ?? "").slice(0, 200),
        body.lat ? Number(body.lat) : null,
        body.lng ? Number(body.lng) : null,
        Math.min(3, Math.max(1, Number(body.priceLevel) || 2)),
        String(body.workHours ?? "10:00–22:00").slice(0, 40),
        body.delivery ? 1 : 0,
        body.pickup ? 1 : 0,
        chefId
      );
      return json({ ok: true });
    }
    case "availability": {
      db.prepare("UPDATE chefs SET available = ? WHERE id = ?").run(body.available ? 1 : 0, chefId);
      return json({ ok: true });
    }
    case "dish_add": {
      const name = String(body.name ?? "").trim().slice(0, 100);
      const price = Math.round(Number(body.price) || 0);
      if (!name || price < 10) return err("Название и цена (от 10 FC) обязательны");
      db.prepare(
        "INSERT INTO dishes (chef_id, name, description, price, emoji, tags, available, created_at) VALUES (?,?,?,?,?,?,1,?)"
      ).run(chefId, name, String(body.description ?? "").slice(0, 400), price,
        String(body.emoji ?? "🍽️").slice(0, 8), String(body.tags ?? "").slice(0, 200), t);
      return json({ ok: true });
    }
    case "dish_toggle": {
      db.prepare("UPDATE dishes SET available = 1 - available WHERE id = ? AND chef_id = ?").run(Number(body.id), chefId);
      return json({ ok: true });
    }
    case "dish_delete": {
      db.prepare("DELETE FROM dishes WHERE id = ? AND chef_id = ?").run(Number(body.id), chefId);
      return json({ ok: true });
    }
    case "recipe_add": {
      const title = String(body.title ?? "").trim().slice(0, 150);
      if (!title) return err("Название рецепта обязательно");
      const ingredients = Array.isArray(body.ingredients)
        ? body.ingredients.map((s: unknown) => String(s).slice(0, 200)).filter(Boolean)
        : [];
      const steps = Array.isArray(body.steps)
        ? body.steps.map((s: unknown) => String(s).slice(0, 500)).filter(Boolean)
        : [];
      if (ingredients.length === 0 || steps.length === 0) return err("Добавьте ингредиенты и шаги");
      db.prepare(
        "INSERT INTO recipes (chef_id, title, description, time_min, difficulty, emoji, ingredients, steps, tags, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)"
      ).run(chefId, title, String(body.description ?? "").slice(0, 600),
        Math.max(1, Number(body.timeMin) || 30), Math.min(3, Math.max(1, Number(body.difficulty) || 2)),
        String(body.emoji ?? "📖").slice(0, 8), JSON.stringify(ingredients), JSON.stringify(steps),
        String(body.tags ?? "").slice(0, 200), t);
      return json({ ok: true });
    }
    case "recipe_delete": {
      db.prepare("DELETE FROM recipes WHERE id = ? AND chef_id = ?").run(Number(body.id), chefId);
      return json({ ok: true });
    }
    case "stream_create": {
      const title = String(body.title ?? "").trim().slice(0, 150);
      if (!title) return err("Название эфира обязательно");
      const dishIds = Array.isArray(body.dishIds) ? body.dishIds.map(Number).filter(Boolean) : [];
      const startNow = !!body.startNow;
      db.prepare(
        "INSERT INTO streams (chef_id, title, status, scheduled_at, started_at, viewers, dish_ids, pinned_message, tags) VALUES (?,?,?,?,?,?,?,?,?)"
      ).run(chefId, title, startNow ? "live" : "scheduled",
        startNow ? null : String(body.scheduledAt ?? nowIso()),
        startNow ? t : null, startNow ? 1 : 0, JSON.stringify(dishIds),
        String(body.pinnedMessage ?? "").slice(0, 300), String(body.tags ?? "").slice(0, 200));
      return json({ ok: true });
    }
    case "stream_start": {
      db.prepare(
        "UPDATE streams SET status = 'live', started_at = ?, viewers = MAX(viewers, 1) WHERE id = ? AND chef_id = ? AND status != 'ended'"
      ).run(t, Number(body.id), chefId);
      return json({ ok: true });
    }
    case "stream_stop": {
      db.prepare("UPDATE streams SET status = 'ended', ended_at = ? WHERE id = ? AND chef_id = ?").run(
        t, Number(body.id), chefId);
      return json({ ok: true });
    }
    case "stream_pin": {
      db.prepare("UPDATE streams SET pinned_message = ? WHERE id = ? AND chef_id = ?").run(
        String(body.text ?? "").slice(0, 300), Number(body.id), chefId);
      return json({ ok: true });
    }
    case "review_reply": {
      db.prepare("UPDATE reviews SET chef_reply = ? WHERE id = ? AND chef_id = ?").run(
        String(body.text ?? "").trim().slice(0, 500), Number(body.id), chefId);
      return json({ ok: true });
    }
    default:
      return err("Неизвестное действие");
  }
}
