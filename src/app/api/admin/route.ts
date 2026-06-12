import { db, nowIso } from "@/lib/db";
import { json, err, requireUser, isResponse } from "@/lib/api";

const plainAll = (rows: unknown[]) => rows.map((r) => ({ ...(r as Record<string, unknown>) }));

export async function GET(req: Request) {
  const user = await requireUser("admin");
  if (isResponse(user)) return user;
  const view = new URL(req.url).searchParams.get("view") ?? "stats";

  if (view === "stats") {
    const one = (sql: string) => (db.prepare(sql).get() as Record<string, number>).v;
    const totalUsers = one("SELECT COUNT(*) AS v FROM users");
    const totalChefs = one("SELECT COUNT(*) AS v FROM chefs");
    const totalOrders = one("SELECT COUNT(*) AS v FROM orders WHERE status != 'cancelled'");
    const gmv = one("SELECT COALESCE(SUM(total),0) AS v FROM orders WHERE status != 'cancelled'");
    const fees = one("SELECT COALESCE(SUM(fee),0) AS v FROM orders WHERE status != 'cancelled'");
    const avgCheck = totalOrders ? Math.round(gmv / totalOrders) : 0;
    const liveStreams = one("SELECT COUNT(*) AS v FROM streams WHERE status = 'live'");
    const totalStreams = one("SELECT COUNT(*) AS v FROM streams");
    const streamViews = one("SELECT COALESCE(SUM(viewers),0) AS v FROM streams");
    const ordersFromStream = one("SELECT COUNT(*) AS v FROM orders WHERE source = 'stream' AND status != 'cancelled'");
    const openComplaints = one("SELECT COUNT(*) AS v FROM complaints WHERE status = 'open'");
    const pendingRequests = one("SELECT COUNT(*) AS v FROM role_requests WHERE status = 'pending'");
    const chatsCount = one("SELECT COUNT(*) AS v FROM chats");
    const messagesCount = one("SELECT COUNT(*) AS v FROM chat_messages") + one("SELECT COUNT(*) AS v FROM stream_messages");

    const revenueByChef = plainAll(
      db
        .prepare(
          `SELECT u.name, COALESCE(SUM(o.total),0) AS revenue, COUNT(o.id) AS orders,
            COALESCE((SELECT ROUND(AVG(rating),1) FROM reviews r WHERE r.chef_id = c.id AND r.status='visible'),0) AS rating
           FROM chefs c JOIN users u ON u.id = c.user_id
           LEFT JOIN orders o ON o.chef_id = c.id AND o.status != 'cancelled'
           GROUP BY c.id ORDER BY revenue DESC LIMIT 10`
        )
        .all()
    );
    const trafficSources = plainAll(
      db
        .prepare(
          `SELECT COALESCE(json_extract(meta, '$.src'), 'другое') AS src, COUNT(*) AS n
           FROM events WHERE type = 'visit' GROUP BY src ORDER BY n DESC`
        )
        .all()
    );
    const ordersByDay = plainAll(
      db
        .prepare(
          `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS n, COALESCE(SUM(total),0) AS sum
           FROM orders GROUP BY day ORDER BY day DESC LIMIT 14`
        )
        .all()
    );

    return json({
      totals: {
        totalUsers, totalChefs, totalOrders, gmv, fees, avgCheck, liveStreams, totalStreams,
        streamViews, ordersFromStream, openComplaints, pendingRequests, chatsCount, messagesCount,
        conversion: streamViews ? Math.round((ordersFromStream / streamViews) * 1000) / 10 : 0,
      },
      revenueByChef, trafficSources, ordersByDay,
    });
  }

  if (view === "users") {
    const users = plainAll(
      db
        .prepare(
          `SELECT u.id, u.email, u.name, u.role, u.avatar, u.blocked, u.created_at AS createdAt,
            (SELECT COUNT(*) FROM orders o WHERE o.customer_id = u.id) AS ordersCount
           FROM users u ORDER BY u.id`
        )
        .all()
    );
    return json({ users });
  }

  if (view === "complaints") {
    const complaints = plainAll(
      db
        .prepare(
          `SELECT c.id, c.target_type AS targetType, c.target_id AS targetId, c.reason, c.status,
            c.created_at AS createdAt, u.name AS authorName
           FROM complaints c JOIN users u ON u.id = c.author_id ORDER BY c.status = 'open' DESC, c.created_at DESC`
        )
        .all()
    );
    return json({ complaints });
  }

  if (view === "reviews") {
    const reviews = plainAll(
      db
        .prepare(
          `SELECT r.id, r.rating, r.text, r.status, r.created_at AS createdAt,
            a.name AS authorName, cu.name AS chefName
           FROM reviews r JOIN users a ON a.id = r.author_id
           JOIN chefs c ON c.id = r.chef_id JOIN users cu ON cu.id = c.user_id
           ORDER BY r.created_at DESC LIMIT 100`
        )
        .all()
    );
    return json({ reviews });
  }

  if (view === "requests") {
    const requests = plainAll(
      db
        .prepare(
          `SELECT rr.id, rr.message, rr.specialization, rr.status, rr.created_at AS createdAt,
            u.name AS userName, u.email
           FROM role_requests rr JOIN users u ON u.id = rr.user_id
           ORDER BY rr.status = 'pending' DESC, rr.created_at DESC`
        )
        .all()
    );
    return json({ requests });
  }

  if (view === "categories") {
    const categories = plainAll(
      db
        .prepare(
          `SELECT cu.id, cu.name, cu.emoji, (SELECT COUNT(*) FROM chefs c WHERE c.cuisine_id = cu.id) AS chefs
           FROM cuisines cu ORDER BY cu.id`
        )
        .all()
    );
    return json({ categories });
  }

  return err("Неизвестный раздел");
}

export async function POST(req: Request) {
  const user = await requireUser("admin");
  if (isResponse(user)) return user;
  const body = await req.json().catch(() => null);
  if (!body) return err("Некорректный запрос");
  const action = String(body.action ?? "");
  const id = Number(body.id);
  const t = nowIso();

  switch (action) {
    case "user_block":
      if (id === user.id) return err("Нельзя заблокировать самого себя");
      db.prepare("UPDATE users SET blocked = 1 WHERE id = ?").run(id);
      db.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
      return json({ ok: true });
    case "user_unblock":
      db.prepare("UPDATE users SET blocked = 0 WHERE id = ?").run(id);
      return json({ ok: true });
    case "review_hide":
      db.prepare("UPDATE reviews SET status = 'hidden' WHERE id = ?").run(id);
      return json({ ok: true });
    case "review_show":
      db.prepare("UPDATE reviews SET status = 'visible' WHERE id = ?").run(id);
      return json({ ok: true });
    case "complaint_resolve":
      db.prepare("UPDATE complaints SET status = 'resolved' WHERE id = ?").run(id);
      return json({ ok: true });
    case "complaint_dismiss":
      db.prepare("UPDATE complaints SET status = 'dismissed' WHERE id = ?").run(id);
      return json({ ok: true });
    case "stream_stop":
      db.prepare("UPDATE streams SET status = 'ended', ended_at = ? WHERE id = ?").run(t, id);
      return json({ ok: true });
    case "request_approve": {
      const rr = db.prepare("SELECT user_id AS uid, specialization FROM role_requests WHERE id = ?").get(id) as
        | { uid: number; specialization: string }
        | undefined;
      if (!rr) return err("Заявка не найдена", 404);
      db.prepare("UPDATE role_requests SET status = 'approved' WHERE id = ?").run(id);
      db.prepare("UPDATE users SET role = 'chef', onboarded = 0 WHERE id = ?").run(rr.uid);
      const hasChef = db.prepare("SELECT 1 FROM chefs WHERE user_id = ?").get(rr.uid);
      if (!hasChef) db.prepare("INSERT INTO chefs (user_id, specialization) VALUES (?,?)").run(rr.uid, rr.specialization);
      return json({ ok: true });
    }
    case "request_reject":
      db.prepare("UPDATE role_requests SET status = 'rejected' WHERE id = ?").run(id);
      return json({ ok: true });
    case "category_add": {
      const name = String(body.name ?? "").trim().slice(0, 50);
      if (!name) return err("Название обязательно");
      db.prepare("INSERT INTO cuisines (name, emoji) VALUES (?,?)").run(name, String(body.emoji ?? "🍽️").slice(0, 8));
      return json({ ok: true });
    }
    case "category_delete":
      db.prepare("UPDATE chefs SET cuisine_id = NULL WHERE cuisine_id = ?").run(id);
      db.prepare("DELETE FROM cuisines WHERE id = ?").run(id);
      return json({ ok: true });
    default:
      return err("Неизвестное действие");
  }
}
