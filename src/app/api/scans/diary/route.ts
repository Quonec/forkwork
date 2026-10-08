import { NextResponse } from "next/server";

import { isResponse, requireScanUser } from "@/lib/api";
import { buildWeek, isValidDate, mskDate, weekRangeUtc, weekStartOf } from "@/lib/scan/diary";
import { listDoneScansInRange } from "@/lib/scan/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/scans/diary?week=YYYY-MM-DD — the owner's week (Mon–Sun, Moscow days); any date in it will do; default is this week. */
export async function GET(req: Request) {
  const user = await requireScanUser();
  if (isResponse(user)) return user;

  const asked = new URL(req.url).searchParams.get("week");
  if (asked !== null && !isValidDate(asked)) {
    return NextResponse.json({ error: "week: дата в формате ГГГГ-ММ-ДД" }, { status: 400 });
  }
  const weekStart = weekStartOf(asked ?? mskDate(new Date()));
  const { from, to } = weekRangeUtc(weekStart);
  const scans = listDoneScansInRange(user.id, from.toISOString(), to.toISOString());
  return NextResponse.json({ week: buildWeek(weekStart, scans) });
}
