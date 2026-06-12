import { db, nowIso } from "@/lib/db";
import { json, err, requireUser, isResponse } from "@/lib/api";

export async function GET() {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const request = db
    .prepare("SELECT id, status, created_at AS createdAt FROM role_requests WHERE user_id = ? ORDER BY id DESC LIMIT 1")
    .get(user.id);
  return json({ request: request ? { ...request } : null });
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  if (user.role !== "customer") return err("Заявку подаёт заказчик");
  const pending = db.prepare("SELECT 1 FROM role_requests WHERE user_id = ? AND status = 'pending'").get(user.id);
  if (pending) return err("Заявка уже на рассмотрении");

  const body = await req.json().catch(() => null);
  const message = String(body?.message ?? "").trim().slice(0, 1000);
  const specialization = String(body?.specialization ?? "").trim().slice(0, 100);
  if (message.length < 20) return err("Расскажите о себе подробнее (минимум 20 символов)");

  db.prepare(
    "INSERT INTO role_requests (user_id, message, specialization, status, created_at) VALUES (?,?,?,'pending',?)"
  ).run(user.id, message, specialization, nowIso());
  return json({ ok: true });
}
