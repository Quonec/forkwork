import { db, nowIso } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { json, err } from "@/lib/api";

// Сигналинг WebRTC поверх HTTP-поллинга + P2P-дерево ретрансляции.
// Повар (host) раздаёт видео первым зрителям; зритель, у которого видео уже
// играет, объявляет себя ретранслятором (relay-ready) и сервер назначает ему
// «детей» — следующих зрителей. Устройства пользователей работают как серверы
// раздачи: нагрузка на повара ограничена MAX_CHILDREN прямыми подключениями.
// Медиа сервер не проксирует — только маршрутизирует сигналы.

type StreamRow = {
  id: number;
  chefId: number;
  status: string;
  visibility: string;
  accessKey: string;
  cameraLive: number;
};

const SIGNAL_TTL_MS = 2 * 60_000;
const STALE_PEER_MS = 10_000;
const MAX_CHILDREN = 3;

// Реестр живых участников дерева (в памяти процесса)
type MeshPeer = { relay: boolean; lastSeen: number };
type Mesh = { peers: Map<string, MeshPeer>; parent: Map<string, string> };
const meshes = ((globalThis as unknown as { __fwMesh?: Map<number, Mesh> }).__fwMesh ??= new Map<
  number,
  Mesh
>());

function meshOf(streamId: number): Mesh {
  let m = meshes.get(streamId);
  if (!m) {
    m = { peers: new Map(), parent: new Map() };
    meshes.set(streamId, m);
  }
  return m;
}

function purgeMesh(m: Mesh) {
  const now = Date.now();
  for (const [pid, p] of m.peers) {
    if (now - p.lastSeen > STALE_PEER_MS) {
      m.peers.delete(pid);
      m.parent.delete(pid);
    }
  }
}

function childCount(m: Mesh, pid: string): number {
  let n = 0;
  for (const parent of m.parent.values()) if (parent === pid) n++;
  return n;
}

// Выбор родителя для нового зрителя: повар — пока у него есть свободные слоты,
// дальше — ретранслятор-зритель с наименьшим числом детей
function pickParent(m: Mesh, joiningPeer: string): string {
  purgeMesh(m);
  const host = m.peers.get("host");
  if (host && childCount(m, "host") < MAX_CHILDREN) return "host";
  let best = "";
  let bestChildren = Infinity;
  for (const [pid, p] of m.peers) {
    if (pid === "host" || pid === joiningPeer || !p.relay) continue;
    const c = childCount(m, pid);
    if (c < MAX_CHILDREN && c < bestChildren) {
      best = pid;
      bestChildren = c;
    }
  }
  return best || "host";
}

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

function pushSignal(streamId: number, sender: string, target: string, type: string, payload: string) {
  db.prepare(
    "INSERT INTO rtc_signals (stream_id, sender, target, type, payload, created_at) VALUES (?,?,?,?,?,?)"
  ).run(streamId, sender, target, type, payload, nowIso());
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

  // Отмечаемся живыми в реестре дерева
  const m = meshOf(stream.id);
  const prev = m.peers.get(peerId);
  m.peers.set(peerId, { relay: peerId === "host" ? true : (prev?.relay ?? false), lastSeen: Date.now() });

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

  const m = meshOf(stream.id);

  // Включение/выключение камеры — только повар этого эфира
  if (type === "camera") {
    if (!isHost) return err("Вещать может только повар этого эфира", 403);
    const on = payload === "1" ? 1 : 0;
    db.prepare("UPDATE streams SET camera_live = ? WHERE id = ?").run(on, stream.id);
    if (!on) {
      db.prepare("DELETE FROM rtc_signals WHERE stream_id = ?").run(stream.id);
      meshes.delete(stream.id);
    }
    return json({ ok: true });
  }

  if (stream.status !== "live") return err("Эфир не идёт");

  if (isHost) {
    // Повар шлёт офферы и кандидатов своим прямым зрителям
    if (!["offer", "ice"].includes(type)) return err("Недопустимый тип сигнала");
    if (!target) return err("target обязателен");
    pushSignal(stream.id, "host", target, type, payload);
    return json({ ok: true });
  }

  // --- Зритель ---
  switch (type) {
    case "join": {
      // Сервер выбирает родителя: повар или зритель-ретранслятор со свободным слотом
      m.peers.set(peerId, { relay: m.peers.get(peerId)?.relay ?? false, lastSeen: Date.now() });
      const parent = pickParent(m, peerId);
      m.parent.set(peerId, parent);
      pushSignal(stream.id, peerId, parent, "join", "");
      return json({ ok: true, parent });
    }
    case "relay-ready": {
      // Видео дошло — устройство зрителя готово раздавать дальше
      m.peers.set(peerId, { relay: true, lastSeen: Date.now() });
      return json({ ok: true });
    }
    case "answer":
    case "ice": {
      if (target) {
        // Сигнал своему ребёнку в дереве — разрешён только настоящему родителю
        if (m.parent.get(target) !== peerId) return err("Недостаточно прав", 403);
        pushSignal(stream.id, peerId, target, type, payload);
      } else {
        // Сигнал своему родителю (повару или ретранслятору)
        pushSignal(stream.id, peerId, m.parent.get(peerId) ?? "host", type, payload);
      }
      return json({ ok: true });
    }
    case "offer": {
      // Оффер зритель-ретранслятор шлёт только назначенному ему ребёнку
      if (!target || m.parent.get(target) !== peerId) return err("Недостаточно прав", 403);
      pushSignal(stream.id, peerId, target, type, payload);
      return json({ ok: true });
    }
    case "leave": {
      const parent = m.parent.get(peerId) ?? "host";
      m.peers.delete(peerId);
      m.parent.delete(peerId);
      pushSignal(stream.id, peerId, parent, "leave", "");
      return json({ ok: true });
    }
    default:
      return err("Недопустимый тип сигнала");
  }
}
