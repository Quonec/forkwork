import { db, nowIso } from "@/lib/db";
import { json, err, requireUser, isResponse } from "@/lib/api";
import { ORDER_FLOW } from "@/lib/types";

type OrderDb = {
  id: number;
  customerId: number;
  chefId: number;
  chefUserId: number;
  status: string;
  items: string;
  total: number;
  fee: number;
  deliveryType: string;
  address: string;
  payment: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  chefName: string;
  customerName: string;
};

function loadOrder(id: number): OrderDb | undefined {
  return db
    .prepare(
      `SELECT o.id, o.customer_id AS customerId, o.chef_id AS chefId, c.user_id AS chefUserId,
        o.status, o.items, o.total, o.fee, o.delivery_type AS deliveryType, o.address, o.payment,
        o.source, o.created_at AS createdAt, o.updated_at AS updatedAt,
        cu.name AS chefName, uu.name AS customerName
       FROM orders o
       JOIN chefs c ON c.id = o.chef_id
       JOIN users cu ON cu.id = c.user_id
       JOIN users uu ON uu.id = o.customer_id
       WHERE o.id = ?`
    )
    .get(id) as OrderDb | undefined;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await ctx.params;
  const order = loadOrder(Number(id));
  if (!order) return err("Заказ не найден", 404);
  if (order.customerId !== user.id && order.chefUserId !== user.id && user.role !== "admin")
    return err("Нет доступа к этому заказу", 403);
  const hasReview = !!db.prepare("SELECT 1 FROM reviews WHERE order_id = ?").get(order.id);
  return json({ order: { ...order, items: JSON.parse(order.items), hasReview } });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await ctx.params;
  const order = loadOrder(Number(id));
  if (!order) return err("Заказ не найден", 404);

  const body = await req.json().catch(() => null);
  const status = String(body?.status ?? "");
  const isChef = order.chefUserId === user.id;
  const isCustomer = order.customerId === user.id;
  if (!isChef && !isCustomer && user.role !== "admin") return err("Нет доступа", 403);

  if (status === "cancelled") {
    if (!["new", "accepted"].includes(order.status)) return err("Заказ уже в работе — отмена невозможна");
    const t = nowIso();
    db.exec("BEGIN");
    try {
      db.prepare("UPDATE orders SET status = 'cancelled', updated_at = ? WHERE id = ?").run(t, order.id);
      if (order.payment === "wallet") {
        db.prepare("UPDATE wallets SET balance = balance + ? WHERE user_id = ?").run(order.total, order.customerId);
        db.prepare("INSERT INTO transactions (user_id, type, amount, comment, ref, created_at) VALUES (?,?,?,?,?,?)").run(
          order.customerId, "refund", order.total, `Возврат по заказу #${order.id}`, `order:${order.id}`, t
        );
      }
      db.prepare("UPDATE wallets SET balance = balance - ? WHERE user_id = ?").run(order.total - order.fee, order.chefUserId);
      db.prepare("INSERT INTO transactions (user_id, type, amount, comment, ref, created_at) VALUES (?,?,?,?,?,?)").run(
        order.chefUserId, "refund", -(order.total - order.fee), `Отмена заказа #${order.id}`, `order:${order.id}`, t
      );
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    return json({ ok: true });
  }

  // Продвижение по статусам — только повар (или админ), строго вперёд по цепочке
  if (!isChef && user.role !== "admin") return err("Статус меняет повар", 403);
  const fromIdx = ORDER_FLOW.indexOf(order.status);
  const toIdx = ORDER_FLOW.indexOf(status);
  if (toIdx === -1 || toIdx !== fromIdx + 1) return err("Недопустимый переход статуса");
  db.prepare("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?").run(status, nowIso(), order.id);
  return json({ ok: true });
}
