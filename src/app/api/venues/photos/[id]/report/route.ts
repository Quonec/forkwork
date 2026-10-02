import { NextResponse } from "next/server";

import { isResponse, requireUser } from "@/lib/api";
import { reportPhoto } from "@/lib/venues/photos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Пожаловаться на фото: одна жалоба с человека, набрав три, фото скрывается. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await params;
  const res = reportPhoto(user.id, id);
  if (res === "missing") return NextResponse.json({ error: "Фото не найдено" }, { status: 404 });
  if (res === "own") return NextResponse.json({ error: "На своё фото жаловаться не нужно: его можно удалить" }, { status: 400 });
  return NextResponse.json({ result: res });
}
