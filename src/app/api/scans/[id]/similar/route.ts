import { NextResponse } from "next/server";

import { isResponse, requireScanUser } from "@/lib/api";
import { db } from "@/lib/db";
import { foldRu, similarDishQuery } from "@/lib/scan/similar";
import { getScanForOwner } from "@/lib/scan/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DishRow = { id: number; name: string; price: number; emoji: string; chefId: number; chefName: string };

/** Dishes cooked by ForkWork chefs that resemble the scan's main dish (head-word match). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireScanUser();
  if (isResponse(user)) return user;
  const { id } = await params;
  const view = getScanForOwner(user.id, id);
  const main = view?.items[0];
  if (!view || !main) return NextResponse.json({ error: "Скан не найден" }, { status: 404 });

  const needle = foldRu(similarDishQuery(main.name));
  const rows = db
    .prepare(
      `SELECT d.id, d.name, d.price, d.emoji, d.chef_id AS chefId, u.name AS chefName
       FROM dishes d JOIN chefs c ON c.id = d.chef_id JOIN users u ON u.id = c.user_id
       WHERE d.available = 1 AND c.available = 1 AND u.blocked = 0`,
    )
    .all() as unknown as DishRow[];

  const seenChefs = new Set<number>();
  const similar = rows
    .filter((r) => foldRu(r.name).includes(needle))
    .filter((r) => (seenChefs.has(r.chefId) ? false : (seenChefs.add(r.chefId), true)))
    .slice(0, 3);
  return NextResponse.json({ query: similarDishQuery(main.name), similar });
}
