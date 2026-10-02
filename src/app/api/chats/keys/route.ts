import { db } from "@/lib/db";
import { json, err, requireUser, isResponse } from "@/lib/api";
import { parsePubJwk } from "@/lib/e2ee";

/**
 * Открытый ключ устройства для шифрования чатов. Заменить уже сохранённый ключ можно только
 * явно (replace: true): после замены старые сообщения на этом ключе не расшифровать.
 */
export async function POST(req: Request) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const body = await req.json().catch(() => null);
  const pub = parsePubJwk(body?.publicKey);
  if (!pub) return err("Некорректный ключ");
  const row = db.prepare("SELECT chat_pubkey AS pub FROM users WHERE id = ?").get(user.id) as { pub: string | null } | undefined;
  if (row?.pub && body?.replace !== true) return err("Ключ уже задан на другом устройстве", 409);
  db.prepare("UPDATE users SET chat_pubkey = ? WHERE id = ?").run(JSON.stringify(pub), user.id);
  return json({ ok: true });
}
