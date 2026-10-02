import { NextResponse } from "next/server";

import { createGuestSession, getSessionUserOrGuest } from "@/lib/auth";
import { db } from "@/lib/db";
import { GUEST_EMAIL_DOMAIN, GUEST_SCAN_LIMIT, isGuestEmail } from "@/lib/guest";
import { guestScansUsed, hasScanConsent, lastDoneScanId, recordScanConsent } from "@/lib/scan/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Сколько новых гостевых аккаунтов в час допускаем на весь сервер (защита от заливки базы). */
const GUEST_CREATE_PER_HOUR = 200;

function status(userId: number, guest: boolean) {
  return {
    consented: hasScanConsent(userId),
    guest,
    guestLeft: guest ? Math.max(0, GUEST_SCAN_LIMIT - guestScansUsed(userId)) : null,
    lastScanId: guest ? lastDoneScanId(userId) : null,
  };
}

/** 401 — посетитель ещё без сессии: сканером он может пользоваться как гость после согласия. */
export async function GET() {
  const user = await getSessionUserOrGuest();
  if (!user) return NextResponse.json({ error: "Нет сессии" }, { status: 401 });
  return NextResponse.json(status(user.id, isGuestEmail(user.email)));
}

export async function POST() {
  const user = await getSessionUserOrGuest();
  if (!user) {
    const since = new Date(Date.now() - 3_600_000).toISOString();
    const row = db
      .prepare("SELECT COUNT(*) AS n FROM users WHERE email LIKE ? AND created_at >= ?")
      .get(`%@${GUEST_EMAIL_DOMAIN}`, since) as { n: number };
    if (row.n >= GUEST_CREATE_PER_HOUR) {
      return NextResponse.json({ error: "Слишком много гостей, попробуйте позже или зарегистрируйтесь", code: "GUEST_BUSY" }, { status: 429 });
    }
    const id = await createGuestSession();
    recordScanConsent(id);
    return NextResponse.json({ ...status(id, true), consented: true });
  }
  recordScanConsent(user.id);
  return NextResponse.json({ ...status(user.id, isGuestEmail(user.email)), consented: true });
}
