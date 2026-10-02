import { NextResponse } from "next/server";

import { isResponse, requireScanUser } from "@/lib/api";
import { deleteScanForOwner, getScanForOwner, updateItemGrams } from "@/lib/scan/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const user = await requireScanUser();
  if (isResponse(user)) return user;
  const { id } = await params;
  const view = getScanForOwner(user.id, id);
  if (!view) return NextResponse.json({ error: "Скан не найден" }, { status: 404 });
  return NextResponse.json({ scan: view });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const user = await requireScanUser();
  if (isResponse(user)) return user;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { itemId?: unknown; grams?: unknown } | null;
  const grams = typeof body?.grams === "number" ? body.grams : NaN;
  if (typeof body?.itemId !== "string" || !Number.isInteger(grams) || grams < 10 || grams > 2000) {
    return NextResponse.json({ error: "Граммы: целое число от 10 до 2000" }, { status: 400 });
  }
  if (!updateItemGrams(user.id, id, body.itemId, grams)) {
    return NextResponse.json({ error: "Скан не найден" }, { status: 404 });
  }
  return NextResponse.json({ scan: getScanForOwner(user.id, id) });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await requireScanUser();
  if (isResponse(user)) return user;
  const { id } = await params;
  if (!deleteScanForOwner(user.id, id)) return NextResponse.json({ error: "Скан не найден" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
