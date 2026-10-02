import { cookies } from "next/headers";
import crypto from "node:crypto";
import { hashSync } from "bcryptjs";
import { db, nowIso } from "./db";
import { GUEST_EMAIL_DOMAIN, isGuestEmail } from "./guest";
import type { SessionUser } from "./types";

const COOKIE = "fw_session";
const TTL_DAYS = 30;

/** Пользователь сессии, включая гостя сканера. Для остального сайта есть `getSessionUser`. */
export async function getSessionUserOrGuest(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.id, u.email, u.name, u.role, u.avatar, u.onboarded, u.blocked, c.id AS chefId
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN chefs c ON c.user_id = u.id
       WHERE s.token = ? AND s.expires_at > ?`
    )
    .get(token, nowIso()) as (SessionUser & { chefId: number | null }) | undefined;
  if (!row || row.blocked) return null;
  return { ...row, chefId: row.chefId ?? null };
}

/** Зарегистрированный пользователь: гостевой аккаунт сканера для остального сайта — как «не вошёл». */
export async function getSessionUser(): Promise<SessionUser | null> {
  const user = await getSessionUserOrGuest();
  return user && !isGuestEmail(user.email) ? user : null;
}

export async function createSession(userId: number) {
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + TTL_DAYS * 86_400_000);
  db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?,?,?)").run(
    token,
    userId,
    expires.toISOString()
  );
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "0",
    path: "/",
    expires,
  });
}

/** Создаёт гостя (скрытого от остального сайта) и входит под ним. */
export async function createGuestSession(): Promise<number> {
  const id = crypto.randomUUID();
  const userId = Number(
    db
      .prepare(
        "INSERT INTO users (email, pass_hash, name, role, avatar, onboarded, created_at) VALUES (?,?,?,?,?,1,?)"
      )
      .run(`guest-${id}@${GUEST_EMAIL_DOMAIN}`, hashSync(crypto.randomBytes(24).toString("hex"), 4), "Гость", "customer", "", nowIso())
      .lastInsertRowid
  );
  await createSession(userId);
  return userId;
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  store.delete(COOKIE);
}
