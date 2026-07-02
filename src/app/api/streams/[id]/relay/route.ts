import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { json, err } from "@/lib/api";

// Резервный канал видео: когда WebRTC не пробивается через NAT (нет TURN),
// повар шлёт бинарные JPEG-кадры (целевые 25 к/с), а зрители смотрят их как
// MJPEG-поток — одно постоянное соединение, сервер сам проталкивает кадры.
// Кадры живут только в памяти процесса — на диск ничего не пишется.

type Entry = { seq: number; at: number; buf: Uint8Array; waiters: Set<() => void> };

const store = ((globalThis as unknown as { __fwRelay?: Map<number, Entry> }).__fwRelay ??= new Map<
  number,
  Entry
>());

const FRAME_TTL_MS = 15_000;
const MAX_FRAME_BYTES = 400_000;
const BOUNDARY = "fwframe";

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

// Будим зрителей, ждущих следующий кадр
function notifyWaiters(e: Entry) {
  for (const w of e.waiters) w();
  e.waiters.clear();
}

function waitNextFrame(e: Entry, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      e.waiters.delete(wake);
      resolve();
    }, ms);
    const wake = () => {
      clearTimeout(timer);
      resolve();
    };
    e.waiters.add(wake);
  });
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const stream = loadStream(Number(id));
  if (!stream) return err("Стрим не найден", 404);
  const url = new URL(req.url);
  const { allowed } = await checkAccess(stream, String(url.searchParams.get("key") ?? ""));
  if (!allowed) return err("Индивидуальный эфир: нужен ключ доступа", 403);

  const entry = store.get(stream.id);
  const alive = !!entry && Date.now() - entry.at <= FRAME_TTL_MS;

  // Лёгкая проверка доступности резервного канала
  if (url.searchParams.get("probe") === "1") return json({ seq: alive ? entry.seq : 0 });

  // Фолбэк для сетей, где прокси буферизует multipart: одиночный кадр JSON'ом
  if (url.searchParams.get("mjpeg") !== "1") {
    const since = Number(url.searchParams.get("since") ?? 0);
    if (!alive) return json({ seq: 0 });
    if (entry.seq <= since) return json({ seq: entry.seq });
    return json({
      seq: entry.seq,
      frame: `data:image/jpeg;base64,${Buffer.from(entry.buf).toString("base64")}`,
    });
  }

  // MJPEG: одно долгоживущее соединение, кадры проталкиваются по мере появления
  const streamId = stream.id;
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let lastSeq = 0;
      try {
        while (!req.signal.aborted) {
          const e = store.get(streamId);
          if (!e || Date.now() - e.at > FRAME_TTL_MS) break;
          if (e.seq > lastSeq) {
            lastSeq = e.seq;
            controller.enqueue(
              encoder.encode(
                `--${BOUNDARY}\r\nContent-Type: image/jpeg\r\nContent-Length: ${e.buf.byteLength}\r\n\r\n`
              )
            );
            controller.enqueue(e.buf);
            controller.enqueue(encoder.encode("\r\n"));
          } else {
            await waitNextFrame(e, 1000);
          }
        }
      } catch {
        // клиент отключился — просто выходим
      }
      try {
        controller.close();
      } catch {}
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": `multipart/x-mixed-replace; boundary=${BOUNDARY}`,
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      // подсказка прокси (nginx и совместимым): не буферизовать поток
      "X-Accel-Buffering": "no",
    },
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const stream = loadStream(Number(id));
  if (!stream) return err("Стрим не найден", 404);
  const url = new URL(req.url);
  const { isHost, allowed } = await checkAccess(stream, String(url.searchParams.get("key") ?? ""));
  if (!allowed) return err("Индивидуальный эфир: нужен ключ доступа", 403);
  if (!isHost) return err("Кадры может слать только повар этого эфира", 403);
  if (stream.status !== "live") return err("Эфир не идёт");

  const buf = new Uint8Array(await req.arrayBuffer());
  // JPEG начинается с маркера FF D8
  if (buf.byteLength < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return err("Ожидается JPEG-кадр");
  if (buf.byteLength > MAX_FRAME_BYTES) return err("Кадр слишком большой");

  const prev = store.get(stream.id);
  const entry: Entry = {
    seq: (prev?.seq ?? 0) + 1,
    at: Date.now(),
    buf,
    waiters: prev?.waiters ?? new Set(),
  };
  store.set(stream.id, entry);
  notifyWaiters(entry);
  return json({ ok: true });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const stream = loadStream(Number(id));
  if (!stream) return err("Стрим не найден", 404);
  const { isHost } = await checkAccess(stream, "");
  if (!isHost) return err("Недостаточно прав", 403);
  const entry = store.get(stream.id);
  if (entry) notifyWaiters(entry); // зрители проснутся и увидят, что кадров больше нет
  store.delete(stream.id);
  return json({ ok: true });
}
