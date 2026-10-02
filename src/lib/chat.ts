import { db, nowIso } from "./db";
import { vaultDelete } from "./vault";

/** Варианты автоудаления сообщений в чате, секунды (0 — выключено). */
export const TTL_OPTIONS = [0, 3600, 86400, 604800] as const;

export const ttlLabel = (sec: number): string =>
  sec === 0 ? "выключено" : sec === 3600 ? "1 час" : sec === 86400 ? "24 часа" : sec === 604800 ? "7 дней" : `${sec} с`;

/** Стирает сообщения, у которых вышел срок, вместе с пометками «удалено у себя». */
export function purgeExpired(): void {
  const now = nowIso();
  const gone = db.prepare("SELECT id, chat_id AS chatId, vault FROM chat_messages WHERE expires_at IS NOT NULL AND expires_at <= ?").all(now) as {
    id: number;
    chatId: number;
    vault: number;
  }[];
  for (const m of gone) if (m.vault) vaultDelete(m.chatId, m.id);
  db.prepare("DELETE FROM chat_messages WHERE expires_at IS NOT NULL AND expires_at <= ?").run(now);
  db.prepare("DELETE FROM chat_hidden WHERE message_id NOT IN (SELECT id FROM chat_messages)").run();
}
