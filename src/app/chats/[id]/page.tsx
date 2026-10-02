"use client";

import { useCallback, useEffect, useRef, useState, use } from "react";
import Link from "next/link";
import { Stranded } from "@/components/ui";
import {
  decryptText,
  deriveChatKey,
  e2eeAvailable,
  encryptText,
  generateKeyPair,
  loadDeviceKey,
  parsePubJwk,
  safetyCode,
  saveDeviceKey,
  type DeviceKey,
  type PubJwk,
} from "@/lib/e2ee";

type ChatInfo = {
  id: number;
  status: string;
  customerId: number;
  chefUserId: number;
  customerName: string;
  chefName: string;
  chefId: number;
  ttlSeconds: number;
  e2ee: number;
};
type Msg = { id: number; senderId: number | null; text: string; enc: number; deletedAt: string | null; expiresAt: string | null; createdAt: string };

const TTL: [number, string][] = [
  [0, "Выключено"],
  [3600, "1 час"],
  [86400, "24 часа"],
  [604800, "7 дней"],
];

/** Состояние шифрования на этом устройстве. */
type Crypto =
  | "init"
  | "ready"
  | "viewer" // админ или посторонний: читать не может
  | "unsupported" // нет Web Crypto (например, обычный http не на localhost)
  | "other-device"; // ключ на сервере принадлежит другому устройству

export default function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [chat, setChat] = useState<ChatInfo | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [pubkeys, setPubkeys] = useState<Record<string, string | null>>({});
  const [me, setMe] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [crypto, setCrypto] = useState<Crypto>("init");
  const [device, setDevice] = useState<DeviceKey | null>(null);
  const [chatKey, setChatKey] = useState<CryptoKey | null>(null);
  const [plain, setPlain] = useState<Record<number, string | null>>({});
  const [code, setCode] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [confirming, setConfirming] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const cache = useRef(new Map<number, string | null>());

  const load = useCallback(async () => {
    const res = await fetch(`/api/chats/${id}`);
    if (res.status === 401) return (window.location.href = "/login");
    const d = await res.json();
    if (!res.ok) return setError(d.error);
    setChat(d.chat);
    setMessages(d.messages);
    setPubkeys(d.pubkeys ?? {});
    setMe(d.me);
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const myPubRaw = me !== null ? pubkeys[String(me)] ?? null : null;
  const participant = chat !== null && me !== null && (me === chat.customerId || me === chat.chefUserId);
  const peerId = chat && me !== null ? (me === chat.customerId ? chat.chefUserId : chat.customerId) : null;
  const peerPubRaw = peerId !== null ? pubkeys[String(peerId)] ?? null : null;

  // Ключ этого устройства: создаём при первом открытии чата и публикуем открытую часть.
  useEffect(() => {
    if (me === null || !chat) return;
    if (!participant) return setCrypto("viewer");
    if (!e2eeAvailable()) return setCrypto("unsupported");
    let live = true;
    (async () => {
      try {
        let local = (await loadDeviceKey(me)) ?? null;
        const server = parsePubJwk(myPubRaw);
        if (!local && !server) {
          local = await generateKeyPair();
          await saveDeviceKey(me, local);
        }
        if (!live) return;
        if (!local) return setCrypto("other-device"); // ключ есть на сервере, но не на этом устройстве
        setDevice(local);
        if (!server) {
          const r = await fetch("/api/chats/keys", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ publicKey: local.publicJwk }),
          });
          if (r.ok) load();
          return setCrypto(r.ok ? "ready" : "other-device");
        }
        setCrypto(server.x === local.publicJwk.x && server.y === local.publicJwk.y ? "ready" : "other-device");
      } catch {
        if (live) setCrypto("unsupported");
      }
    })();
    return () => {
      live = false;
    };
  }, [me, chat, participant, myPubRaw, load]);

  // Общий ключ чата и код безопасности: считаются, когда есть ключи обоих собеседников.
  useEffect(() => {
    setChatKey(null);
    cache.current.clear();
    setPlain({});
    setCode("");
    const peer = parsePubJwk(peerPubRaw);
    if (crypto !== "ready" || !device || !peer || !chat) return;
    let live = true;
    deriveChatKey(device.privateKey, peer, chat.id).then(async (k) => {
      if (!live) return;
      setChatKey(k);
      setCode(await safetyCode(device.publicJwk as PubJwk, peer));
    });
    return () => {
      live = false;
    };
  }, [crypto, device, peerPubRaw, chat?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Расшифровка новых сообщений (результат кэшируется по номеру).
  useEffect(() => {
    if (!chatKey || !chat) return;
    let live = true;
    (async () => {
      let changed = false;
      for (const m of messages) {
        if (m.enc !== 1 || m.deletedAt || m.senderId === null || cache.current.has(m.id)) continue;
        cache.current.set(m.id, await decryptText(chatKey, m.text, chat.id, m.senderId));
        changed = true;
      }
      if (live && changed) setPlain(Object.fromEntries(cache.current));
    })();
    return () => {
      live = false;
    };
  }, [messages, chatKey, chat]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim().slice(0, 1000);
    if (!text || !chat || me === null || (chat.e2ee && !chatKey)) return;
    setError("");
    const payload = chat.e2ee ? await encryptText(chatKey!, text, chat.id, me) : text;
    const res = await fetch(`/api/chats/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: payload }),
    });
    if (res.ok) {
      setInput("");
      load();
    } else setError((await res.json()).error ?? "Ошибка отправки");
  };

  const remove = async (messageId: number, scope: "all" | "me") => {
    setConfirming(null);
    const res = await fetch(`/api/chats/${id}?messageId=${messageId}${scope === "me" ? "&scope=me" : ""}`, { method: "DELETE" });
    if (!res.ok) setError((await res.json()).error ?? "Не удалось удалить");
    load();
  };

  const setE2ee = async (enabled: boolean) => {
    await fetch(`/api/chats/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "e2ee", enabled }),
    });
    load();
  };

  const setTtl = async (seconds: number) => {
    await fetch(`/api/chats/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ttl", seconds }),
    });
    load();
  };

  const manage = async (action: string) => {
    await fetch(`/api/chats/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    load();
  };

  /** Новый ключ на этом устройстве: старые зашифрованные сообщения станут нечитаемыми. */
  const useThisDevice = async () => {
    if (me === null) return;
    const kp = await generateKeyPair();
    await saveDeviceKey(me, kp);
    const r = await fetch("/api/chats/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publicKey: kp.publicJwk, replace: true }),
    });
    if (!r.ok) return setError("Не удалось сохранить ключ");
    setDevice(kp);
    setCrypto("ready");
    load();
  };

  if (error && !chat) return <Stranded title={error} hint="Возможно, чат не найден или у вас нет к нему доступа." />;
  if (!chat) return <div className="py-24 text-center text-stone-400">Загружаем чат…</div>;

  const iAmChef = me === chat.chefUserId;
  const otherName = iAmChef ? chat.customerName : chat.chefName;
  const statusOk = chat.status === "active" || (chat.status === "pending" && iAmChef);
  const peerHasKey = !!parsePubJwk(peerPubRaw);
  const encOn = chat.e2ee === 1;
  const canWrite = statusOk && participant && (encOn ? crypto === "ready" && peerHasKey && !!chatKey : true);
  const hasLegacy = messages.some((m) => m.senderId !== null && m.enc !== 1 && !m.deletedAt);

  const placeholder = !statusOk
    ? chat.status === "pending"
      ? "Дождитесь согласия повара"
      : "Чат недоступен"
    : !participant
      ? "Вы не участник этого чата"
      : !encOn
        ? "Сообщение (без шифрования)…"
      : crypto === "other-device"
        ? "Ключ шифрования на другом устройстве"
        : crypto === "unsupported"
          ? "Шифрование не поддерживается"
          : !peerHasKey
            ? "Собеседник ещё не включил шифрование"
            : "Сообщение…";

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-2xl flex-col px-4 py-6 sm:px-6">
      <div className="card flex items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <Link href="/chats" className="text-stone-400 hover:text-stone-600">←</Link>
          <div>
            <p className="font-bold">{otherName}</p>
            <p className="text-xs text-stone-400">
              {chat.status === "pending" ? "ожидает согласия повара" : chat.status === "active" ? "чат активен" : chat.status === "declined" ? "запрос отклонён" : "заблокирован"}
              {encOn ? (crypto === "ready" && chatKey ? " · сквозное шифрование" : "") : " · без шифрования"}
            </p>
          </div>
        </div>
        {iAmChef && chat.status === "pending" && (
          <div className="flex gap-2">
            <button onClick={() => manage("accept")} className="btn-primary !py-1.5 text-xs">Принять</button>
            <button onClick={() => manage("decline")} className="btn-secondary !py-1.5 text-xs">Отклонить</button>
          </div>
        )}
        {iAmChef && chat.status === "active" && (
          <button onClick={() => manage("block")} className="btn-danger !py-1.5 text-xs">Заблокировать</button>
        )}
      </div>

      <div className="card mt-3 flex-1 space-y-3 overflow-y-auto p-4">
        <div className="rounded-xl bg-stone-50 px-3 py-2 text-[11px] leading-relaxed text-stone-500">
          {encOn
            ? "Сообщения шифруются на вашем устройстве: прочитать их можете только вы и собеседник, сервер и администраторы видят лишь шифртекст. Если очистить данные браузера или сменить устройство, прежняя переписка станет нечитаемой."
            : "Шифрование выключено: новые сообщения хранятся на сервере в закрытом хранилище. Сервер и администрация могут их прочитать, например при жалобе."}{" "}
          {code && (
            <button type="button" onClick={() => setShowCode((v) => !v)} className="font-semibold text-orange-700 underline">
              {showCode ? "Скрыть код безопасности" : "Код безопасности"}
            </button>
          )}
          {showCode && code && (
            <span className="mt-1 block">
              <span className="font-mono text-xs tracking-wider text-stone-800">{code}</span>
              <br />
              Сверьте этот код с собеседником лично или по телефону: если он у вас совпадает, переписку никто не подменил.
            </span>
          )}
        </div>

        {participant && chat.status === "active" && (
          <label className="flex items-center justify-between gap-3 rounded-xl bg-stone-50 px-3 py-2 text-[11px] text-stone-500">
            <span>Сквозное шифрование новых сообщений</span>
            <input
              id="chat-e2ee"
              type="checkbox"
              role="switch"
              checked={encOn}
              onChange={(e) => setE2ee(e.target.checked)}
              className="h-4 w-4 accent-stone-900"
            />
          </label>
        )}
        {participant && chat.status === "active" && (
          <label className="flex items-center justify-between gap-3 rounded-xl bg-stone-50 px-3 py-2 text-[11px] text-stone-500">
            <span>Автоудаление новых сообщений у обоих</span>
            <select
              id="chat-ttl"
              value={chat.ttlSeconds}
              onChange={(e) => setTtl(Number(e.target.value))}
              className="rounded-lg border border-stone-200 bg-white px-2 py-1 text-xs text-stone-800"
            >
              {TTL.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>
        )}
        {encOn && crypto === "other-device" && (
          <div className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Ключ шифрования вашего аккаунта создан на другом устройстве, поэтому здесь переписка нечитаема.
            <button type="button" onClick={useThisDevice} className="ml-1 font-semibold underline">Использовать это устройство</button>
            {" "}(старые сообщения станут нечитаемыми совсем).
          </div>
        )}
        {encOn && crypto === "unsupported" && (
          <div className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Браузер не поддерживает шифрование на этой странице. Откройте сайт по https или на localhost.
          </div>
        )}
        {!participant && (
          <div className="rounded-xl bg-stone-100 px-3 py-2 text-xs text-stone-600">
            Вы не участник чата: сообщения зашифрованы, прочитать их без ключей собеседников нельзя.
          </div>
        )}
        {encOn && crypto === "ready" && !peerHasKey && statusOk && (
          <div className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {otherName} ещё не открывал чат после включения шифрования. Писать можно будет, когда он зайдёт в этот чат.
          </div>
        )}
        {hasLegacy && (
          <p className="text-center text-[11px] text-stone-400">Сообщения без значка шифрования отправлены до его включения и хранились открыто.</p>
        )}

        {messages.map((m) => {
          if (m.senderId === null) return <p key={m.id} className="text-center text-[11px] text-stone-400">— {m.text} —</p>;
          const mine = m.senderId === me;
          const deleted = !!m.deletedAt;
          const encrypted = m.enc === 1;
          const body = deleted
            ? null
            : encrypted
              ? m.id in plain
                ? plain[m.id] ?? "Не удалось расшифровать (ключ собеседника или ваш изменился)"
                : crypto === "viewer" || crypto === "other-device" || crypto === "unsupported"
                  ? "Зашифрованное сообщение"
                  : "…"
              : m.text;
          return (
            <div key={m.id} className={`msg-in flex flex-col ${mine ? "items-end" : "items-start"}`}>
              <div
                className={`max-w-[80%] rounded-xl px-3.5 py-2 text-sm ${
                  deleted
                    ? "border border-dashed border-stone-300 text-stone-400 italic"
                    : mine
                      ? "bg-stone-950 text-white"
                      : "bg-stone-100 text-stone-900"
                }`}
              >
                {deleted ? "Сообщение удалено" : body}
              </div>
              {participant && (
                <div className="mt-0.5 text-[11px] text-stone-400">
                  {m.expiresAt && !deleted && <span className="mr-2">исчезнет {new Date(m.expiresAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>}
                  {confirming === m.id ? (
                    <>
                      {mine && !deleted && (
                        <button type="button" onClick={() => remove(m.id, "all")} className="mr-2 font-semibold text-red-600 underline">У обоих</button>
                      )}
                      <button type="button" onClick={() => remove(m.id, "me")} className="mr-2 font-semibold underline">У себя</button>
                      <button type="button" onClick={() => setConfirming(null)} className="underline">Отмена</button>
                    </>
                  ) : (
                    <button type="button" onClick={() => setConfirming(m.id)} className="underline hover:text-stone-600">Удалить</button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {error && <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

      <form onSubmit={send} className="mt-3 flex gap-2">
        <input
          className="input flex-1"
          placeholder={placeholder}
          value={input}
          maxLength={1000}
          onChange={(e) => setInput(e.target.value)}
          disabled={!canWrite}
        />
        <button className="btn-primary" disabled={!canWrite}>→</button>
      </form>
    </div>
  );
}
