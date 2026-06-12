import { db } from "@/lib/db";
import { json, requireUser, isResponse } from "@/lib/api";

export async function GET() {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const ids = db.prepare("SELECT chef_id AS chefId FROM favorites WHERE user_id = ?").all(user.id) as unknown as {
    chefId: number;
  }[];
  return json({ chefIds: ids.map((r) => r.chefId) });
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const body = await req.json().catch(() => null);
  const chefId = Number(body?.chefId);
  if (!chefId) return json({ error: "chefId обязателен" }, 400);
  const exists = db.prepare("SELECT 1 FROM favorites WHERE user_id = ? AND chef_id = ?").get(user.id, chefId);
  if (exists) {
    db.prepare("DELETE FROM favorites WHERE user_id = ? AND chef_id = ?").run(user.id, chefId);
    return json({ ok: true, favorite: false });
  }
  db.prepare("INSERT INTO favorites (user_id, chef_id) VALUES (?,?)").run(user.id, chefId);
  return json({ ok: true, favorite: true });
}
