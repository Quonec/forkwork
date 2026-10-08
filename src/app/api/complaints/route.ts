import { db, nowIso } from "@/lib/db";
import { json, err, requireUser, isResponse } from "@/lib/api";

export async function POST(req: Request) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const body = await req.json().catch(() => null);
  const targetType = String(body?.targetType ?? "");
  const targetId = Number(body?.targetId);
  const reason = String(body?.reason ?? "").trim().slice(0, 500);
  if (!["review", "message", "chef", "user", "stream"].includes(targetType)) return err("Некорректный тип жалобы");
  if (!targetId || !reason) return err("Опишите причину жалобы");

  db.prepare(
    "INSERT INTO complaints (author_id, target_type, target_id, reason, status, created_at) VALUES (?,?,?,?,'open',?)"
  ).run(user.id, targetType, targetId, reason, nowIso());
  return json({ ok: true });
}
