import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Проверка живости для хостинга: отвечает, если сервер поднялся и база открывается. Подробностей наружу не отдаёт. */
export async function GET() {
  try {
    db.prepare("SELECT 1").get();
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
