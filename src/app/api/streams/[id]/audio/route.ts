import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { json, err } from "@/lib/api";

// Звук резервного канала: повар шлёт короткие самодостаточные аудиосегменты
// (MediaRecorder, ~1.5 с, Opus/WebM), зритель забирает их лонг-поллингом и
// склеивает в непрерывный поток через MediaSource. Сегменты живут в памяти.

type AudioEntry = {
  seq: number;
  at: number;
  mime: string;
  segs: Map<number, Uint8Array>;
  waiters: Set<() => void>;
};

const store = ((globalThis as unknown as { __fwAudio?: Map<number, AudioEntry> }).__fwAudio ??= new Map<
  number,
  AudioEntry
>());

const TTL_MS = 15_000;
const SEG_KEEP = 12;
const MAX_SEG_BYTES = 400_000;
const LONG_POLL_MS = 4000;

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

function notifyWaiters(e: AudioEntry) {
  for (const w of e.waiters) w();
  e.waiters.clear();
}

function waitNextSeg(e: AudioEntry, ms: number): Promise<void> {
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

  const since = Number(url.searchParams.get("since") ?? 0);
  let entry = store.get(stream.id);
  if (!entry || Date.now() - entry.at > TTL_MS) return new Response(null, { status: 204 });

  // Отстали больше чем на 5 сегментов — прыгаем ближе к прямому эфиру
  let want = since + 1;
  if (entry.seq - since > 5) want = entry.seq - 1;

  if (entry.seq < want) {
    await waitNextSeg(entry, LONG_POLL_MS);
    entry = store.get(stream.id);
    if (!entry || Date.now() - entry.at > TTL_MS) return new Response(null, { status: 204 });
  }

  // Берём ближайший доступный сегмент, начиная с want
  let seg: Uint8Array | undefined;
  let seq = 0;
  for (let s = want; s <= entry.seq; s++) {
    const found = entry.segs.get(s);
    if (found) {
      seg = found;
      seq = s;
      break;
    }
  }
  if (!seg) return new Response(null, { status: 204 });

  return new Response(Buffer.from(seg), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Seq": String(seq),
      "X-Mime": entry.mime,
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
  if (!isHost) return err("Звук может слать только повар этого эфира", 403);
  if (stream.status !== "live") return err("Эфир не идёт");

  const buf = new Uint8Array(await req.arrayBuffer());
  if (buf.byteLength < 8) return err("Пустой сегмент");
  if (buf.byteLength > MAX_SEG_BYTES) return err("Сегмент слишком большой");
  const mime = String(url.searchParams.get("mime") ?? "audio/webm").slice(0, 80);

  const prev = store.get(stream.id);
  const entry: AudioEntry = prev ?? { seq: 0, at: 0, mime, segs: new Map(), waiters: new Set() };
  entry.seq += 1;
  entry.at = Date.now();
  entry.mime = mime;
  entry.segs.set(entry.seq, buf);
  entry.segs.delete(entry.seq - SEG_KEEP);
  store.set(stream.id, entry);
  notifyWaiters(entry);
  return json({ ok: true, seq: entry.seq });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const stream = loadStream(Number(id));
  if (!stream) return err("Стрим не найден", 404);
  const { isHost } = await checkAccess(stream, "");
  if (!isHost) return err("Недостаточно прав", 403);
  const entry = store.get(stream.id);
  if (entry) notifyWaiters(entry);
  store.delete(stream.id);
  return json({ ok: true });
}
