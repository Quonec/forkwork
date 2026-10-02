import { NextResponse } from "next/server";

import { isResponse, requireScanUser } from "@/lib/api";
import { isValidDate } from "@/lib/scan/diary";
import { askAssistant } from "@/lib/venues/assistant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { question, week? } — ответ помощника по заведениям с учётом недельного дневника пользователя. */
export async function POST(req: Request) {
  const user = await requireScanUser();
  if (isResponse(user)) return user;
  const body = (await req.json().catch(() => null)) as { question?: unknown; week?: unknown } | null;
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (question.length < 2) return NextResponse.json({ error: "Задайте вопрос" }, { status: 400 });
  const week = typeof body?.week === "string" && isValidDate(body.week) ? body.week : undefined;
  return NextResponse.json(await askAssistant(user.id, question, week));
}
