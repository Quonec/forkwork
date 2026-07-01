import { db, nowIso } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { json, err } from "@/lib/api";

// Сигналинг WebRTC поверх HTTP-поллинга: повар (host) и зрители обмениваются
// SDP-офферами/ансверами и ICE-кандидатами через таблицу rtc_signals.
// Медиапоток идёт напрямую peer-to-peer — сервер видео не проксирует.

type StreamRow = {
  id: number;
  chefId: number;
  status: string;
  visibility: string;
  accessKey: string;
  cameraLive: number;
};

const SIGNAL_TTL_MS = 2 * 60_000;

function loadStream(id: number): StreamRow | undefined {
  return db
    .prepare(
      `SELECT id, chef_id AS chefId, status, visibility, access_key AS accessKey, camera_live AS cameraLive
       FROM streams WHERE id = ?`
    )
    .get(id) as StreamRow | undefined;
}

async function checkAccess(stream: StreamRow, key: string) {
  const user = await getSessionUser();
  const isHost = !!user && user.chefId === stream.chefId;
  const isStaff = !!user && (user.role === "admin" || user.role === "manager");
  const allowed =
    stream.visibility !== "private" || isHost || isStaff || (key !== "" && key === stream.accessKey);
  return { isHost, allowed };
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const stream = loadStream(Number(id));
  if (!stream) return err("Стрим не найден", 404);

  const url = new URL(req.url);
  const peerId = String(url.searchParams.get("peerId") ?? "").slice(0, 64);
  const key = String(url.searchParams.get("key") ?? "");
  const { isHost, allowed } = await checkAccess(stream, key);
  if (!allowed) return err("Индивидуальный эфир: нужна личная ссылка с ключом", 403);
  if (!peerId) return err("peerId обязателен");
  // Ящик host читает только сам повар — иначе зритель мог бы перехватить сигналинг
  if (peerId === "host" && !isHost) return err("Недостаточно прав", 403);

  db.prepare("DELETE FROM rtc_signals WHERE created_at < ?").run(
    new Date(Date.now() - SIGNAL_TTL_MS).toISOString()
  );

  const rows = db
    .prepare(
      "SELECT id, sender, type, payload FROM rtc_signals WHERE stream_id = ? AND target = ? ORDER BY id"
    )
    .all(stream.id, peerId) as { id: number; sender: string; type: string; payload: string }[];
  if (rows.length > 0) {
    const ph = rows.map(() => "?").join(",");
    db.prepare(`DELETE FROM rtc_signals WHERE id IN (${ph})`).run(...rows.map((r) => r.id));
  }

  return json({
    signals: rows.map((r) => ({ sender: r.sender, type: r.type, payload: r.payload })),
    cameraLive: loadStream(stream.id)?.cameraLive ?? 0,
    status: stream.status,
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const stream = loadStream(Number(id));
  if (!stream) return err("Стрим не найден", 404);

  const body = await req.json().catch(() => null);
  if (!body) return err("Некорректный запрос");
  const key = String(body.key ?? "");
  const { isHost, allowed } = await checkAccess(stream, key);
  if (!allowed) return err("Индивидуальный эфир: нужна личная ссылка с ключом", 403);

  const type = String(body.type ?? "");
  const peerId = String(body.peerId ?? "").slice(0, 64);
  const target = String(body.target ?? "").slice(0, 64);
  const payload = String(body.payload ?? "").slice(0, 100_000);
  if (!peerId) return err("peerId обязателен");

  // Включение/выключение камеры — только повар этого эфира
  if (type === "camera") {
    if (!isHost) return err("Вещать может только повар этого эфира", 403);
    const on = payload === "1" ? 1 : 0;
    db.prepare("UPDATE streams SET camera_live = ? WHERE id = ?").run(on, stream.id);
    if (!on) db.prepare("DELETE FROM rtc_signals WHERE stream_id = ?").run(stream.id);
    return json({ ok: true });
  }

  if (stream.status !== "live") return err("Эфир не идёт");

  const hostTypes = new Set(["offer", "ice"]);
  const viewerTypes = new Set(["join", "answer", "ice", "leave"]);
  if (isHost) {
    if (!hostTypes.has(type)) return err("Недопустимый тип сигнала");
    if (!target) return err("target обязателен");
  } else {
    if (!viewerTypes.has(type)) return err("Недопустимый тип сигнала");
  }

  db.prepare(
    "INSERT INTO rtc_signals (stream_id, sender, target, type, payload, created_at) VALUES (?,?,?,?,?,?)"
  ).run(stream.id, isHost ? "host" : peerId, isHost ? target : "host", type, payload, nowIso());
  return json({ ok: true });
}
