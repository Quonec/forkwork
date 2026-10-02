import { NextResponse } from "next/server";

import { isResponse, requireScanUser } from "@/lib/api";
import { isValidDate } from "@/lib/scan/diary";
import { buildAdvice } from "@/lib/venues/advice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/venues/advice?week=YYYY-MM-DD — разбор недельного дневника владельца и подборка блюд из меню заведений. */
export async function GET(req: Request) {
  const user = await requireScanUser();
  if (isResponse(user)) return user;
  const asked = new URL(req.url).searchParams.get("week");
  if (asked !== null && !isValidDate(asked)) {
    return NextResponse.json({ error: "week: дата в формате ГГГГ-ММ-ДД" }, { status: 400 });
  }
  return NextResponse.json({ advice: await buildAdvice(user.id, asked ?? undefined) });
}
