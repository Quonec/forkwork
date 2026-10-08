import { compareSync } from "bcryptjs";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { json, err } from "@/lib/api";
import { logEvent } from "@/lib/queries";
import { clientIp, loginBlockedFor, loginFailed, loginSucceeded } from "@/lib/ratelimit";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return err("Некорректный запрос");
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  // Перебор пароля: после серии неудач вход на время закрыт (подробности в lib/ratelimit).
  const ip = clientIp(req);
  const wait = loginBlockedFor(email, ip);
  if (wait > 0) {
    return NextResponse.json(
      { error: `Слишком много неудачных попыток. Повторите через ${Math.ceil(wait / 60)} мин.` },
      { status: 429, headers: { "Retry-After": String(wait) } },
    );
  }

  const user = db
    .prepare("SELECT id, pass_hash AS passHash, blocked, role, onboarded FROM users WHERE email = ?")
    .get(email) as { id: number; passHash: string; blocked: number; role: string; onboarded: number } | undefined;

  if (!user || !compareSync(password, user.passHash)) {
    loginFailed(email, ip);
    return err("Неверный email или пароль", 401);
  }
  loginSucceeded(email);
  if (user.blocked) return err("Аккаунт заблокирован администратором", 403);

  logEvent("login", user.id);
  await createSession(user.id);
  return json({ ok: true, role: user.role, onboarded: user.onboarded });
}
