import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { json, err } from "@/lib/api";

// Резервный канал видео: когда WebRTC не пробивается через NAT (нет TURN),
// повар шлёт JPEG-кадры на сервер, зрители забирают их поллингом.
// Кадры живут только в памяти процесса — на диск ничего не пишется.

type RelayFrame = { seq: number; at: number; frame: string };

const store = ((globalThis as unknown as { __fwRelay?: Map<number, RelayFrame> }).__fwRelay ??= new Map<
  number,
  RelayFrame
>());

const FRAME_TTL_MS = 15_000;
const MAX_FRAME_BYTES = 300_000;

type StreamRow = { id: number; chefId: number; status: string; visibility: string; accessKey: string };

function loadStream(id: number): StreamRow | undefined {
  return db
    .prepare(
      `SELECT id, chef_id AS chefId, status, visibility, access_key AS accessKey FROM streams WHERE id = ?`
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
  const { allowed } = await checkAccess(stream, String(url.searchParams.get("key") ?? ""));
  if (!allowed) return err("Индивидуальный эфир: нужен ключ доступа", 403);

  const since = Number(url.searchParams.get("since") ?? 0);
  const entry = store.get(stream.id);
  if (!entry || Date.now() - entry.at > FRAME_TTL_MS) return json({ seq: 0 });
  if (entry.seq <= since) return json({ seq: entry.seq });
  return json({ seq: entry.seq, frame: entry.frame });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const stream = loadStream(Number(id));
  if (!stream) return err("Стрим не найден", 404);
  const body = await req.json().catch(() => null);
  if (!body) return err("Некорректный запрос");
  const { isHost, allowed } = await checkAccess(stream, String(body.key ?? ""));
  if (!allowed) return err("Индивидуальный эфир: нужен ключ доступа", 403);
  if (!isHost) return err("Кадры может слать только повар этого эфира", 403);
  if (stream.status !== "live") return err("Эфир не идёт");

  const frame = String(body.frame ?? "");
  if (!frame.startsWith("data:image/jpeg")) return err("Ожидается JPEG-кадр");
  if (frame.length > MAX_FRAME_BYTES) return err("Кадр слишком большой");

  const prev = store.get(stream.id);
  store.set(stream.id, { seq: (prev?.seq ?? 0) + 1, at: Date.now(), frame });
  return json({ ok: true });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const stream = loadStream(Number(id));
  if (!stream) return err("Стрим не найден", 404);
  const { isHost } = await checkAccess(stream, "");
  if (!isHost) return err("Недостаточно прав", 403);
  store.delete(stream.id);
  return json({ ok: true });
}
