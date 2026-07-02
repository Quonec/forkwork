import { db, nowIso } from "@/lib/db";
import { json, err, requireUser, isResponse } from "@/lib/api";

export async function GET() {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const wallet = db.prepare("SELECT balance FROM wallets WHERE user_id = ?").get(user.id) as { balance: number } | undefined;
  const transactions = db
    .prepare(
      "SELECT id, type, amount, comment, created_at AS createdAt FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50"
    )
    .all(user.id);
  return json({ balance: wallet?.balance ?? 0, transactions });
}

const TOPUP_LIMIT = 100_000; // антифрод-ограничение на одну операцию

export async function POST(req: Request) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const body = await req.json().catch(() => null);
  const action = String(body?.action ?? "");
  const t = nowIso();

  if (action === "topup") {
    const amount = Math.round(Number(body?.amount) || 0);
    if (amount < 50) return err("Минимальное пополнение — 50 FC");
    if (amount > TOPUP_LIMIT) return err(`Максимум за одну операцию — ${TOPUP_LIMIT.toLocaleString("ru-RU")} FC`);
    db.prepare("UPDATE wallets SET balance = balance + ? WHERE user_id = ?").run(amount, user.id);
    db.prepare("INSERT INTO transactions (user_id, type, amount, comment, ref, created_at) VALUES (?,?,?,?,?,?)").run(
      user.id, "topup", amount, "Пополнение кошелька", "", t
    );
    return json({ ok: true });
  }

  if (action === "tip") {
    const chefId = Number(body?.chefId);
    const amount = Math.round(Number(body?.amount) || 0);
    if (amount < 10) return err("Минимальные чаевые — 10 FC");
    if (amount > 10_000) return err("Максимальные чаевые — 10 000 FC");
    const chef = db
      .prepare("SELECT c.user_id AS uid, u.name FROM chefs c JOIN users u ON u.id = c.user_id WHERE c.id = ?")
      .get(chefId) as { uid: number; name: string } | undefined;
    if (!chef) return err("Повар не найден", 404);
    if (chef.uid === user.id) return err("Себе чаевые не оставить");
    const wallet = db.prepare("SELECT balance FROM wallets WHERE user_id = ?").get(user.id) as { balance: number } | undefined;
    if (!wallet || wallet.balance < amount) return err("Недостаточно средств в кошельке");

    db.exec("BEGIN");
    try {
      db.prepare("UPDATE wallets SET balance = balance - ? WHERE user_id = ?").run(amount, user.id);
      db.prepare("UPDATE wallets SET balance = balance + ? WHERE user_id = ?").run(amount, chef.uid);
      db.prepare("INSERT INTO transactions (user_id, type, amount, comment, ref, created_at) VALUES (?,?,?,?,?,?)").run(
        user.id, "tip_out", -amount, `Чаевые повару ${chef.name}`, "", t
      );
      db.prepare("INSERT INTO transactions (user_id, type, amount, comment, ref, created_at) VALUES (?,?,?,?,?,?)").run(
        chef.uid, "tip_in", amount, `Чаевые от ${user.name}`, "", t
      );
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    return json({ ok: true });
  }

  return err("Неизвестное действие");
}
