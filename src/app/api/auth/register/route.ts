import { hashSync } from "bcryptjs";
import { db, nowIso } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { json, err } from "@/lib/api";
import { logEvent } from "@/lib/queries";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return err("Некорректный запрос");
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const name = String(body.name ?? "").trim();
  const role = body.role === "chef" ? "chef" : "customer";

  if (!/^\S+@\S+\.\S+$/.test(email)) return err("Укажите корректный email");
  if (password.length < 6) return err("Пароль — минимум 6 символов");
  if (name.length < 2) return err("Укажите имя");

  const exists = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (exists) return err("Пользователь с таким email уже зарегистрирован");

  const avatar = "";
  const userId = Number(
    db
      .prepare(
        "INSERT INTO users (email, pass_hash, name, role, avatar, onboarded, created_at) VALUES (?,?,?,?,?,0,?)"
      )
      .run(email, hashSync(password, 8), name, role, avatar, nowIso()).lastInsertRowid
  );
  db.prepare("INSERT INTO wallets (user_id, balance) VALUES (?, 500)").run(userId);
  db.prepare("INSERT INTO transactions (user_id, type, amount, comment, ref, created_at) VALUES (?,?,?,?,?,?)").run(
    userId, "topup", 500, "Приветственный бонус ForkWork", "", nowIso()
  );

  if (role === "chef") {
    // Профиль повара создаётся сразу, заполняется в кабинете
    db.prepare("INSERT INTO chefs (user_id, bio, specialization) VALUES (?,?,?)").run(
      userId, "", String(body.specialization ?? "").trim()
    );
  }

  logEvent("signup", userId, { role });
  await createSession(userId);
  return json({ ok: true, role });
}
