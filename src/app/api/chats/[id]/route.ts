import { db, nowIso } from "@/lib/db";
import { json, err, requireUser, isResponse } from "@/lib/api";
import { isCipherPayload } from "@/lib/e2ee";
import { purgeExpired, TTL_OPTIONS, ttlLabel } from "@/lib/chat";
import { vaultDelete, vaultGet, vaultPut } from "@/lib/vault";

type ChatDb = {
  id: number;
  status: string;
  customerId: number;
  chefUserId: number;
  customerName: string;
  chefName: string;
  chefId: number;
  ttlSeconds: number;
  e2ee: number;
};

function loadChat(id: number): ChatDb | undefined {
  return db
    .prepare(
      `SELECT ch.id, ch.status, ch.customer_id AS customerId, c.user_id AS chefUserId, c.id AS chefId, ch.ttl_seconds AS ttlSeconds, ch.e2ee AS e2ee,
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
  purgeExpired();
  // Удалённые сообщения отдаём без текста: остаётся пометка «удалено».
  const messages = db
    .prepare(
      `SELECT id, sender_id AS senderId, CASE WHEN deleted_at IS NULL THEN text ELSE '' END AS text, enc, vault,
              deleted_at AS deletedAt, expires_at AS expiresAt, created_at AS createdAt
       FROM chat_messages
       WHERE chat_id = ? AND id NOT IN (SELECT message_id FROM chat_hidden WHERE user_id = ?)
       ORDER BY created_at, id`
    )
    .all(chat.id, user.id) as { id: number; text: string; vault: number; deletedAt: string | null }[];
  for (const m of messages) if (m.vault && !m.deletedAt) m.text = vaultGet(chat.id, m.id) ?? "";
  // Открытые ключи собеседников для шифрования; закрытых на сервере нет.
  const keys = db.prepare("SELECT id, chat_pubkey AS pub FROM users WHERE id IN (?, ?)").all(chat.customerId, chat.chefUserId) as { id: number; pub: string | null }[];
  const pubkeys = Object.fromEntries(keys.map((k) => [k.id, k.pub]));
  return json({ chat: { ...chat }, messages, me: user.id, pubkeys });
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
  // Сквозное шифрование включено — принимаем только шифртекст. Выключено — обычный текст уходит в секретное хранилище.
  if (chat.customerId !== user.id && chat.chefUserId !== user.id) return err("Писать в чат могут только его участники", 403);
  const expires = chat.ttlSeconds > 0 ? new Date(Date.now() + chat.ttlSeconds * 1000).toISOString() : null;
  if (isCipherPayload(body?.text)) {
    db.prepare("INSERT INTO chat_messages (chat_id, sender_id, text, enc, expires_at, created_at) VALUES (?,?,?,1,?,?)").run(
      chat.id, user.id, body.text, expires, nowIso()
    );
    return json({ ok: true });
  }
  if (chat.e2ee) return err("В этом чате включено сквозное шифрование: обновите страницу и попробуйте снова");
  const text = String(body?.text ?? "").trim().slice(0, 1000);
  if (!text) return err("Пустое сообщение");
  const mid = Number(
    db.prepare("INSERT INTO chat_messages (chat_id, sender_id, text, enc, vault, expires_at, created_at) VALUES (?,?,'',0,1,?,?)").run(
      chat.id, user.id, expires, nowIso()
    ).lastInsertRowid
  );
  try {
    vaultPut(chat.id, mid, text);
  } catch {
    db.prepare("DELETE FROM chat_messages WHERE id = ?").run(mid);
    return err("Не удалось сохранить сообщение", 500);
  }
  return json({ ok: true });
}

/** Удаление своего сообщения у обоих: текст стирается, остаётся пометка «удалено». */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await ctx.params;
  const chat = loadChat(Number(id));
  if (!chat) return err("Чат не найден", 404);
  const messageId = Number(new URL(req.url).searchParams.get("messageId"));
  if (!Number.isInteger(messageId)) return err("Не указано сообщение");
  const msg = db.prepare("SELECT sender_id AS senderId, deleted_at AS deletedAt, vault FROM chat_messages WHERE id = ? AND chat_id = ?").get(messageId, chat.id) as
    | { senderId: number | null; deletedAt: string | null; vault: number }
    | undefined;
  if (!msg) return err("Сообщение не найдено", 404);
  // «Удалить у себя»: скрывает любое сообщение чата только для этого участника.
  if (new URL(req.url).searchParams.get("scope") === "me") {
    if (chat.customerId !== user.id && chat.chefUserId !== user.id) return err("Нет доступа к чату", 403);
    db.prepare("INSERT OR IGNORE INTO chat_hidden (message_id, user_id) VALUES (?,?)").run(messageId, user.id);
    return json({ ok: true });
  }
  if (msg.senderId !== user.id) return err("Удалять можно только свои сообщения", 403);
  if (msg.deletedAt) return json({ ok: true });
  if (msg.vault) vaultDelete(chat.id, messageId);
  db.prepare("UPDATE chat_messages SET text = '', deleted_at = ? WHERE id = ?").run(nowIso(), messageId);
  return json({ ok: true });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await ctx.params;
  const chat = loadChat(Number(id));
  if (!chat) return err("Чат не найден", 404);
  const body = await req.json().catch(() => null);
  const action = String(body?.action ?? "");
  const t = nowIso();
  const sys = db.prepare("INSERT INTO chat_messages (chat_id, sender_id, text, created_at) VALUES (?,NULL,?,?)");

  // Автоудаление новых сообщений: меняет любой из двух участников, прежние сообщения не затрагиваются.
  if (action === "ttl") {
    if (chat.customerId !== user.id && chat.chefUserId !== user.id) return err("Нет доступа к чату", 403);
    const sec = Number(body?.seconds);
    if (!(TTL_OPTIONS as readonly number[]).includes(sec)) return err("Недопустимый срок");
    db.prepare("UPDATE chats SET ttl_seconds = ? WHERE id = ?").run(sec, chat.id);
    sys.run(chat.id, sec === 0 ? "Автоудаление сообщений выключено." : `Новые сообщения будут удаляться через ${ttlLabel(sec)}.`, t);
    return json({ ok: true });
  }

  // Сквозное шифрование включает и выключает любой из двух участников; прежние сообщения остаются как были.
  if (action === "e2ee") {
    if (chat.customerId !== user.id && chat.chefUserId !== user.id) return err("Нет доступа к чату", 403);
    const on = body?.enabled === true ? 1 : 0;
    db.prepare("UPDATE chats SET e2ee = ? WHERE id = ?").run(on, chat.id);
    sys.run(
      chat.id,
      on
        ? "Сквозное шифрование включено: новые сообщения читаются только вами и собеседником."
        : "Сквозное шифрование выключено: новые сообщения хранятся на сервере в закрытом хранилище, администрация может прочитать их при жалобе.",
      t,
    );
    return json({ ok: true });
  }

  if (chat.chefUserId !== user.id) return err("Управлять чатом может только повар", 403);

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
