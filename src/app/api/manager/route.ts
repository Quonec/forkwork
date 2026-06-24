import { db, nowIso } from "@/lib/db";
import { json, err, requireUser, isResponse } from "@/lib/api";
import { logEvent } from "@/lib/queries";

const plainAll = (rows: unknown[]) => rows.map((r) => ({ ...(r as Record<string, unknown>) }));

const SUPPORT_BONUS = 200; // маркетинг-поддержка повару, FC

// Назначения текущего менеджера: какие повара под его контролем/поддержкой
function assignmentsOf(managerId: number) {
  return db
    .prepare("SELECT chef_id AS chefId, kind FROM manager_assignments WHERE manager_id = ?")
    .all(managerId) as { chefId: number; kind: string }[];
}
function chefIdsOf(managerId: number): number[] {
  return [...new Set(assignmentsOf(managerId).map((a) => a.chefId))];
}
function managesChef(managerId: number, chefId: number): boolean {
  return !!db
    .prepare("SELECT 1 FROM manager_assignments WHERE manager_id = ? AND chef_id = ? LIMIT 1")
    .get(managerId, chefId);
}
// Определяет, к какому повару относится жалоба (через объект жалобы)
function complaintChefId(targetType: string, targetId: number): number | null {
  if (targetType === "chef") return targetId;
  if (targetType === "stream") {
    const r = db.prepare("SELECT chef_id AS c FROM streams WHERE id = ?").get(targetId) as { c: number } | undefined;
    return r?.c ?? null;
  }
  if (targetType === "review") {
    const r = db.prepare("SELECT chef_id AS c FROM reviews WHERE id = ?").get(targetId) as { c: number } | undefined;
    return r?.c ?? null;
  }
  return null;
}

export async function GET(req: Request) {
  const user = await requireUser("manager");
  if (isResponse(user)) return user;
  const view = new URL(req.url).searchParams.get("view") ?? "overview";

  const ids = chefIdsOf(user.id);
  const placeholders = ids.length ? ids.map(() => "?").join(",") : "NULL";

  // Карта вид прав по повару: { chefId: ['control','support'] }
  const kindsByChef: Record<number, string[]> = {};
  for (const a of assignmentsOf(user.id)) (kindsByChef[a.chefId] ??= []).push(a.kind);

  if (view === "overview") {
    const one = (sql: string) => (db.prepare(sql).get(...ids) as Record<string, number>)?.v ?? 0;
    const chefsCount = ids.length;
    const gmv = ids.length ? one(`SELECT COALESCE(SUM(total),0) AS v FROM orders WHERE status != 'cancelled' AND chef_id IN (${placeholders})`) : 0;
    const revenue = ids.length ? one(`SELECT COALESCE(SUM(total-fee),0) AS v FROM orders WHERE status != 'cancelled' AND chef_id IN (${placeholders})`) : 0;
    const ordersCount = ids.length ? one(`SELECT COUNT(*) AS v FROM orders WHERE status != 'cancelled' AND chef_id IN (${placeholders})`) : 0;
    const newOrders = ids.length ? one(`SELECT COUNT(*) AS v FROM orders WHERE status = 'new' AND chef_id IN (${placeholders})`) : 0;
    const liveNow = ids.length ? one(`SELECT COUNT(*) AS v FROM streams WHERE status = 'live' AND chef_id IN (${placeholders})`) : 0;
    const clientsCount = ids.length ? one(`SELECT COUNT(DISTINCT customer_id) AS v FROM orders WHERE status != 'cancelled' AND chef_id IN (${placeholders})`) : 0;
    const avgRating = ids.length
      ? (db.prepare(`SELECT COALESCE(ROUND(AVG(rating),1),0) AS v FROM reviews WHERE status='visible' AND chef_id IN (${placeholders})`).get(...ids) as { v: number }).v
      : 0;
    const openComplaints = ids.length
      ? (db.prepare(
          `SELECT COUNT(*) AS v FROM complaints
           WHERE status='open' AND (
             (target_type='chef' AND target_id IN (${placeholders})) OR
             (target_type='stream' AND target_id IN (SELECT id FROM streams WHERE chef_id IN (${placeholders}))) OR
             (target_type='review' AND target_id IN (SELECT id FROM reviews WHERE chef_id IN (${placeholders})))
           )`
        ).get(...ids, ...ids, ...ids) as { v: number }).v
      : 0;

    // Точки внимания
    const attention = ids.length
      ? plainAll(
          db
            .prepare(
              `SELECT u.name AS chef, c.id AS chefId,
                CASE WHEN c.available = 0 THEN 'не принимает заказы'
                     WHEN (SELECT COUNT(*) FROM orders o WHERE o.chef_id=c.id AND o.status='new') > 0 THEN 'новые заказы ждут принятия'
                     WHEN COALESCE((SELECT AVG(rating) FROM reviews r WHERE r.chef_id=c.id AND r.status='visible'),5) < 4 THEN 'рейтинг ниже 4★'
                     ELSE '' END AS issue
               FROM chefs c JOIN users u ON u.id=c.user_id
               WHERE c.id IN (${placeholders})`
            )
            .all(...ids)
        ).filter((r) => (r as { issue: string }).issue)
      : [];

    return json({
      totals: { chefsCount, gmv, revenue, ordersCount, newOrders, liveNow, clientsCount, avgRating, openComplaints },
      attention,
      manager: { name: user.name },
    });
  }

  if (view === "chefs") {
    if (!ids.length) return json({ chefs: [] });
    const rows = plainAll(
      db
        .prepare(
          `SELECT c.id, c.user_id AS userId, u.name, u.email, u.blocked, c.available,
            c.specialization, cu.name AS cuisineName, c.price_level AS priceLevel,
            (SELECT id FROM streams s WHERE s.chef_id=c.id AND s.status='live' LIMIT 1) AS liveStreamId,
            COALESCE((SELECT ROUND(AVG(rating),1) FROM reviews r WHERE r.chef_id=c.id AND r.status='visible'),0) AS rating,
            (SELECT COUNT(*) FROM reviews r WHERE r.chef_id=c.id AND r.status='visible') AS reviewsCount,
            (SELECT COUNT(*) FROM orders o WHERE o.chef_id=c.id AND o.status!='cancelled') AS ordersCount,
            (SELECT COUNT(*) FROM orders o WHERE o.chef_id=c.id AND o.status='new') AS newOrders,
            COALESCE((SELECT SUM(total-fee) FROM orders o WHERE o.chef_id=c.id AND o.status!='cancelled'),0) AS revenue,
            COALESCE((SELECT balance FROM wallets w WHERE w.user_id=c.user_id),0) AS wallet,
            (SELECT MAX(created_at) FROM orders o WHERE o.chef_id=c.id) AS lastOrderAt,
            (SELECT COUNT(*) FROM dishes d WHERE d.chef_id=c.id AND d.available=1) AS dishesCount
           FROM chefs c JOIN users u ON u.id=c.user_id LEFT JOIN cuisines cu ON cu.id=c.cuisine_id
           WHERE c.id IN (${placeholders}) ORDER BY revenue DESC`
        )
        .all(...ids)
    ).map((r) => ({ ...r, kinds: kindsByChef[(r as { id: number }).id] ?? [] }));
    return json({ chefs: rows });
  }

  if (view === "clients") {
    if (!ids.length) return json({ clients: [] });
    const clients = plainAll(
      db
        .prepare(
          `SELECT u.id, u.name, u.email, u.blocked,
            COUNT(o.id) AS ordersCount,
            COALESCE(SUM(o.total),0) AS totalSpent,
            MAX(o.created_at) AS lastOrderAt,
            (SELECT COUNT(*) FROM favorites f WHERE f.user_id=u.id AND f.chef_id IN (${placeholders})) AS favChefs
           FROM orders o JOIN users u ON u.id=o.customer_id
           WHERE o.status!='cancelled' AND o.chef_id IN (${placeholders})
           GROUP BY u.id ORDER BY totalSpent DESC`
        )
        .all(...ids, ...ids)
    );
    return json({ clients });
  }

  if (view === "managers") {
    // Кандидаты для передачи прав + текущее распределение по нашим поварам
    const others = plainAll(
      db
        .prepare(
          `SELECT u.id, u.name, u.email,
            (SELECT COUNT(*) FROM manager_assignments ma WHERE ma.manager_id=u.id) AS load
           FROM users u WHERE u.role='manager' AND u.id != ? ORDER BY u.name`
        )
        .all(user.id)
    );
    const mine = ids.length
      ? plainAll(
          db
            .prepare(
              `SELECT ma.chef_id AS chefId, ma.kind, u.name AS chef
               FROM manager_assignments ma JOIN chefs c ON c.id=ma.chef_id JOIN users u ON u.id=c.user_id
               WHERE ma.manager_id = ? ORDER BY u.name, ma.kind`
            )
            .all(user.id)
        )
      : [];
    return json({ managers: others, assignments: mine });
  }

  return err("Неизвестный раздел");
}

export async function POST(req: Request) {
  const user = await requireUser("manager");
  if (isResponse(user)) return user;
  const body = await req.json().catch(() => null);
  if (!body) return err("Некорректный запрос");
  const action = String(body.action ?? "");
  const t = nowIso();

  switch (action) {
    case "transfer": {
      const chefId = Number(body.chefId);
      const kind = body.kind === "support" ? "support" : "control";
      const toManagerId = Number(body.toManagerId);
      if (!db.prepare("SELECT 1 FROM manager_assignments WHERE manager_id=? AND chef_id=? AND kind=?").get(user.id, chefId, kind))
        return err("У вас нет этих прав на повара", 403);
      const target = db.prepare("SELECT 1 FROM users WHERE id=? AND role='manager'").get(toManagerId);
      if (!target) return err("Менеджер-получатель не найден", 404);
      if (toManagerId === user.id) return err("Это вы и есть");
      db.prepare("UPDATE manager_assignments SET manager_id=?, created_at=? WHERE chef_id=? AND kind=?").run(toManagerId, t, chefId, kind);
      logEvent("manager_transfer", user.id, { chefId, kind, toManagerId });
      return json({ ok: true });
    }

    case "chef_availability": {
      const chefId = Number(body.chefId);
      if (!managesChef(user.id, chefId)) return err("Повар не в вашем ведении", 403);
      db.prepare("UPDATE chefs SET available=? WHERE id=?").run(body.available ? 1 : 0, chefId);
      return json({ ok: true });
    }

    case "stream_pin": {
      const chefId = Number(body.chefId);
      if (!managesChef(user.id, chefId)) return err("Повар не в вашем ведении", 403);
      const live = db.prepare("SELECT id FROM streams WHERE chef_id=? AND status='live' LIMIT 1").get(chefId) as { id: number } | undefined;
      if (!live) return err("У повара сейчас нет эфира");
      db.prepare("UPDATE streams SET pinned_message=? WHERE id=?").run(String(body.text ?? "").slice(0, 200), live.id);
      return json({ ok: true });
    }

    case "stream_stop": {
      const streamId = Number(body.streamId);
      const s = db.prepare("SELECT chef_id AS chefId FROM streams WHERE id=?").get(streamId) as { chefId: number } | undefined;
      if (!s || !managesChef(user.id, s.chefId)) return err("Стрим не в вашем ведении", 403);
      db.prepare("UPDATE streams SET status='ended', ended_at=? WHERE id=?").run(t, streamId);
      return json({ ok: true });
    }

    case "complaint_resolve": {
      const id = Number(body.id);
      const c = db.prepare("SELECT target_type AS tt, target_id AS ti FROM complaints WHERE id=?").get(id) as
        | { tt: string; ti: number }
        | undefined;
      if (!c) return err("Жалоба не найдена", 404);
      const chefId = complaintChefId(c.tt, c.ti);
      if (!chefId || !managesChef(user.id, chefId)) return err("Жалоба не по вашему повару", 403);
      db.prepare("UPDATE complaints SET status='resolved' WHERE id=?").run(id);
      return json({ ok: true });
    }

    case "chef_bonus": {
      const chefId = Number(body.chefId);
      if (!managesChef(user.id, chefId)) return err("Повар не в вашем ведении", 403);
      const ch = db.prepare("SELECT user_id AS uid FROM chefs WHERE id=?").get(chefId) as { uid: number } | undefined;
      if (!ch) return err("Повар не найден", 404);
      db.prepare("UPDATE wallets SET balance = balance + ? WHERE user_id=?").run(SUPPORT_BONUS, ch.uid);
      db.prepare("INSERT INTO transactions (user_id, type, amount, comment, ref, created_at) VALUES (?,?,?,?,?,?)").run(
        ch.uid, "support", SUPPORT_BONUS, `Маркетинг-поддержка от менеджера ${user.name}`, "", t
      );
      logEvent("manager_bonus", user.id, { chefId, amount: SUPPORT_BONUS });
      return json({ ok: true });
    }

    default:
      return err("Неизвестное действие");
  }
}
