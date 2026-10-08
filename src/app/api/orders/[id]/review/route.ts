import { db, nowIso } from "@/lib/db";
import { json, err, requireUser, isResponse } from "@/lib/api";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await ctx.params;
  const order = db
    .prepare("SELECT id, customer_id AS customerId, chef_id AS chefId, status FROM orders WHERE id = ?")
    .get(Number(id)) as { id: number; customerId: number; chefId: number; status: string } | undefined;
  if (!order) return err("Заказ не найден", 404);
  if (order.customerId !== user.id) return err("Отзыв может оставить только автор заказа", 403);
  if (order.status !== "done") return err("Отзыв можно оставить после выполнения заказа");
  if (db.prepare("SELECT 1 FROM reviews WHERE order_id = ?").get(order.id)) return err("Отзыв уже оставлен");

  const body = await req.json().catch(() => null);
  const rating = Math.min(5, Math.max(1, Number(body?.rating) || 0));
  const text = String(body?.text ?? "").trim().slice(0, 1000);
  if (!rating) return err("Поставьте оценку от 1 до 5");

  db.prepare(
    "INSERT INTO reviews (chef_id, author_id, order_id, rating, text, status, created_at) VALUES (?,?,?,?,?,'visible',?)"
  ).run(order.chefId, user.id, order.id, rating, text, nowIso());
  return json({ ok: true });
}
