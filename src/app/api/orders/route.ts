import { db, nowIso } from "@/lib/db";
import { json, err, requireUser, isResponse } from "@/lib/api";
import { logEvent } from "@/lib/queries";
import { PLATFORM_FEE } from "@/lib/types";

export async function GET() {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const orders = db
    .prepare(
      `SELECT o.id, o.status, o.items, o.total, o.delivery_type AS deliveryType, o.payment, o.source,
        o.created_at AS createdAt, o.chef_id AS chefId, u.name AS chefName,
        EXISTS(SELECT 1 FROM reviews r WHERE r.order_id = o.id) AS hasReview
       FROM orders o JOIN chefs c ON c.id = o.chef_id JOIN users u ON u.id = c.user_id
       WHERE o.customer_id = ? ORDER BY o.created_at DESC`
    )
    .all(user.id)
    .map((o) => {
      const row = o as Record<string, unknown>;
      return { ...row, items: JSON.parse(String(row.items)) };
    });
  return json({ orders });
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const body = await req.json().catch(() => null);
  if (!body) return err("Некорректный запрос");

  const chefId = Number(body.chefId);
  const reqItems: { dishId: number; qty: number }[] = Array.isArray(body.items) ? body.items : [];
  const deliveryType = body.deliveryType === "pickup" ? "pickup" : "delivery";
  const payment = body.payment === "card" ? "card" : "wallet";
  const address = String(body.address ?? "").trim().slice(0, 200);
  const source = ["stream", "map", "site"].includes(body.source) ? body.source : "site";

  if (!chefId || reqItems.length === 0) return err("Корзина пуста");
  if (deliveryType === "delivery" && !address) return err("Укажите адрес доставки");

  const chef = db
    .prepare(
      `SELECT c.id, c.available, c.delivery, c.pickup, c.user_id AS chefUserId, u.name AS chefName
       FROM chefs c JOIN users u ON u.id = c.user_id WHERE c.id = ?`
    )
    .get(chefId) as { id: number; available: number; delivery: number; pickup: number; chefUserId: number; chefName: string } | undefined;
  if (!chef) return err("Повар не найден", 404);
  if (!chef.available) return err("Повар сейчас не принимает заказы");
  if (chef.chefUserId === user.id) return err("Нельзя заказать у самого себя");
  if (deliveryType === "delivery" && !chef.delivery) return err("Этот повар не делает доставку");
  if (deliveryType === "pickup" && !chef.pickup) return err("У этого повара нет самовывоза");

  // Цены берём из базы — клиенту не доверяем
  const items: { dishId: number; name: string; price: number; qty: number; emoji: string }[] = [];
  for (const it of reqItems) {
    const dish = db
      .prepare("SELECT id, name, price, emoji, available, chef_id AS dishChef FROM dishes WHERE id = ?")
      .get(Number(it.dishId)) as { id: number; name: string; price: number; emoji: string; available: number; dishChef: number } | undefined;
    if (!dish || dish.dishChef !== chefId) return err("Блюдо не найдено у этого повара");
    if (!dish.available) return err(`Блюдо «${dish.name}» сейчас недоступно`);
    const qty = Math.min(Math.max(1, Number(it.qty) || 1), 20);
    items.push({ dishId: dish.id, name: dish.name, price: dish.price, qty, emoji: dish.emoji });
  }
  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  const fee = Math.round(total * PLATFORM_FEE);
  const t = nowIso();

  if (payment === "wallet") {
    const wallet = db.prepare("SELECT balance FROM wallets WHERE user_id = ?").get(user.id) as { balance: number } | undefined;
    if (!wallet || wallet.balance < total) return err("Недостаточно средств в кошельке. Пополните баланс.");
  }

  db.exec("BEGIN");
  try {
    const orderId = Number(
      db.prepare(
        `INSERT INTO orders (customer_id, chef_id, status, items, total, fee, delivery_type, address, payment, source, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
      ).run(user.id, chefId, "new", JSON.stringify(items), total, fee, deliveryType, address, payment, source, t, t).lastInsertRowid
    );

    if (payment === "wallet") {
      db.prepare("UPDATE wallets SET balance = balance - ? WHERE user_id = ?").run(total, user.id);
      db.prepare("INSERT INTO transactions (user_id, type, amount, comment, ref, created_at) VALUES (?,?,?,?,?,?)").run(
        user.id, "payment", -total, `Оплата заказа #${orderId} (${chef.chefName})`, `order:${orderId}`, t
      );
    }
    // Повар получает сумму за вычетом комиссии платформы сразу (демо-упрощение)
    db.prepare("UPDATE wallets SET balance = balance + ? WHERE user_id = ?").run(total - fee, chef.chefUserId);
    db.prepare("INSERT INTO transactions (user_id, type, amount, comment, ref, created_at) VALUES (?,?,?,?,?,?)").run(
      chef.chefUserId, "income", total - fee, `Заказ #${orderId} (комиссия платформы ${Math.round(PLATFORM_FEE * 100)}%)`, `order:${orderId}`, t
    );
    db.exec("COMMIT");
    logEvent("order_created", user.id, { source, orderId, total });
    return json({ ok: true, orderId });
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
