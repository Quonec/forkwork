import { db, nowIso } from "@/lib/db";
import { json, err, requireUser, isResponse } from "@/lib/api";

type ChatDb = {
  id: number;
  status: string;
  customerId: number;
  chefUserId: number;
  customerName: string;
  chefName: string;
  chefId: number;
};

function loadChat(id: number): ChatDb | undefined {
  return db
    .prepare(
      `SELECT ch.id, ch.status, ch.customer_id AS customerId, c.user_id AS chefUserId, c.id AS chefId,
        cust.name AS customerName, chefu.name AS chefName
       FROM chats ch
       JOIN chefs c ON c.id = ch.chef_id
       JOIN users cust ON cust.id = ch.customer_id
       JOIN users chefu ON chefu.id = c.user_id
       WHERE ch.id = ?`
    )
    .get(id) as ChatDb | undefined;
}

const canAccess = (chat: ChatDb, userId: number, role: string) =>
  chat.customerId === userId || chat.chefUserId === userId || role === "admin";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await ctx.params;
  const chat = loadChat(Number(id));
  if (!chat) return err("Чат не найден", 404);
  if (!canAccess(chat, user.id, user.role)) return err("Нет доступа к чату", 403);
  const messages = db
    .prepare(
      "SELECT id, sender_id AS senderId, text, created_at AS createdAt FROM chat_messages WHERE chat_id = ? ORDER BY created_at"
    )
    .all(chat.id);
  return json({ chat: { ...chat }, messages, me: user.id });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await ctx.params;
  const chat = loadChat(Number(id));
  if (!chat) return err("Чат не найден", 404);
  if (!canAccess(chat, user.id, user.role)) return err("Нет доступа к чату", 403);
  if (chat.status === "pending" && user.id === chat.customerId)
    return err("Дождитесь, пока повар примет запрос на чат");
  if (chat.status !== "active" && user.id !== chat.chefUserId) return err("Чат не активен");

  const body = await req.json().catch(() => null);
  const text = String(body?.text ?? "").trim().slice(0, 1000);
  if (!text) return err("Пустое сообщение");
  db.prepare("INSERT INTO chat_messages (chat_id, sender_id, text, created_at) VALUES (?,?,?,?)").run(
    chat.id, user.id, text, nowIso()
  );
  return json({ ok: true });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await ctx.params;
  const chat = loadChat(Number(id));
  if (!chat) return err("Чат не найден", 404);
  if (chat.chefUserId !== user.id) return err("Управлять чатом может только повар", 403);

  const body = await req.json().catch(() => null);
  const action = String(body?.action ?? "");
  const t = nowIso();
  const sys = db.prepare("INSERT INTO chat_messages (chat_id, sender_id, text, created_at) VALUES (?,NULL,?,?)");

  if (action === "accept") {
    db.prepare("UPDATE chats SET status = 'active' WHERE id = ?").run(chat.id);
    sys.run(chat.id, "Повар принял запрос. Личный чат открыт — будьте взаимно вежливы!", t);
    return json({ ok: true });
  }
  if (action === "decline") {
    db.prepare("UPDATE chats SET status = 'declined' WHERE id = ?").run(chat.id);
    sys.run(chat.id, "Повар отклонил запрос на личный чат.", t);
    return json({ ok: true });
  }
  if (action === "block") {
    db.prepare("UPDATE chats SET status = 'blocked' WHERE id = ?").run(chat.id);
    sys.run(chat.id, "Чат заблокирован поваром.", t);
    return json({ ok: true });
  }
  return err("Неизвестное действие");
}
