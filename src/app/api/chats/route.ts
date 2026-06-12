import { db, nowIso } from "@/lib/db";
import { json, err, requireUser, isResponse } from "@/lib/api";

export async function GET() {
  const user = await requireUser();
  if (isResponse(user)) return user;
  // Чаты, где пользователь — заказчик, либо повар (через профиль повара)
  const chats = db
    .prepare(
      `SELECT ch.id, ch.status, ch.created_at AS createdAt,
        cust.name AS customerName, cust.avatar AS customerAvatar, cust.id AS customerId,
        chefu.name AS chefName, chefu.avatar AS chefAvatar, c.id AS chefId, c.user_id AS chefUserId,
        (SELECT text FROM chat_messages m WHERE m.chat_id = ch.id ORDER BY m.created_at DESC LIMIT 1) AS lastMessage,
        (SELECT created_at FROM chat_messages m WHERE m.chat_id = ch.id ORDER BY m.created_at DESC LIMIT 1) AS lastAt
       FROM chats ch
       JOIN users cust ON cust.id = ch.customer_id
       JOIN chefs c ON c.id = ch.chef_id
       JOIN users chefu ON chefu.id = c.user_id
       WHERE ch.customer_id = ? OR c.user_id = ?
       ORDER BY COALESCE(lastAt, ch.created_at) DESC`
    )
    .all(user.id, user.id);
  return json({ chats, me: user.id });
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const body = await req.json().catch(() => null);
  const chefId = Number(body?.chefId);
  if (!chefId) return err("chefId обязателен");
  const chef = db.prepare("SELECT id, user_id AS uid FROM chefs WHERE id = ?").get(chefId) as
    | { id: number; uid: number }
    | undefined;
  if (!chef) return err("Повар не найден", 404);
  if (chef.uid === user.id) return err("Это ваш собственный профиль");

  const existing = db
    .prepare("SELECT id, status FROM chats WHERE customer_id = ? AND chef_id = ?")
    .get(user.id, chefId) as { id: number; status: string } | undefined;
  if (existing) return json({ ok: true, chatId: existing.id, status: existing.status });

  const t = nowIso();
  const chatId = Number(
    db.prepare("INSERT INTO chats (customer_id, chef_id, status, created_at) VALUES (?,?,'pending',?)").run(user.id, chefId, t)
      .lastInsertRowid
  );
  db.prepare("INSERT INTO chat_messages (chat_id, sender_id, text, created_at) VALUES (?,NULL,?,?)").run(
    chatId,
    "Запрос на личный чат отправлен. Повар должен подтвердить диалог — таковы правила платформы.",
    t
  );
  return json({ ok: true, chatId, status: "pending" });
}
