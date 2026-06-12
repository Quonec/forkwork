"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ChefCard, Dish, SessionUser, StreamInfo } from "@/lib/types";
import { useCart } from "@/components/cart";
import { Stars, LiveBadge } from "@/components/ui";
import { fmtFC, fmtDateTime } from "@/lib/format";

type ChatMsg = { id: number; userId: number | null; authorName: string; text: string; kind: string; createdAt: string };
type Analysis = {
  live: boolean;
  summary: string;
  detected: { id: number; name: string; emoji: string; confidence: number } | null;
  tags: string[];
  suggestions: { id: number; name: string; price: number; emoji: string }[];
};

const REACTIONS = ["🔥", "😋", "👏", "❤️"];

export default function StreamRoom({
  stream,
  chef,
  dishes,
  user,
}: {
  stream: StreamInfo;
  chef: ChefCard | null;
  dishes: Dish[];
  user: SessionUser | null;
}) {
  const router = useRouter();
  const cart = useCart();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [viewers, setViewers] = useState(stream.viewers);
  const [status, setStatus] = useState(stream.status);
  const [input, setInput] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [floats, setFloats] = useState<{ id: number; emoji: string }[]>([]);
  const chatRef = useRef<HTMLDivElement>(null);
  const isLive = status === "live";

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/streams/${stream.id}/messages`);
      if (!res.ok) return;
      const data = await res.json();
      setMessages(data.messages);
      setViewers(data.viewers);
      setStatus(data.status);
    } catch {}
  }, [stream.id]);

  useEffect(() => {
    poll();
    const t = setInterval(poll, 3000);
    return () => clearInterval(t);
  }, [poll]);

  useEffect(() => {
    const load = () =>
      fetch(`/api/ai/stream-analysis?streamId=${stream.id}`)
        .then((r) => r.json())
        .then(setAnalysis)
        .catch(() => {});
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [stream.id]);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const send = async (text: string, kind: "msg" | "reaction" = "msg") => {
    if (!user) return router.push("/login");
    if (!text.trim()) return;
    if (kind === "reaction") {
      const id = Date.now() + Math.random();
      setFloats((f) => [...f, { id, emoji: text }]);
      setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 2500);
    }
    await fetch(`/api/streams/${stream.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, kind }),
    });
    setInput("");
    poll();
  };

  const orderDish = (d: Dish) => {
    cart.add(stream.chefId, stream.chefName ?? "", { dishId: d.id, name: d.name, price: d.price, emoji: d.emoji }, "stream");
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        {/* Левая колонка: видео + инфо */}
        <div className="space-y-4">
          {/* «Видео» */}
          <div className="relative aspect-video overflow-hidden rounded-2xl bg-gradient-to-br from-stone-900 via-stone-800 to-orange-950 ring-1 ring-stone-800">
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
              <div className="steam mb-2 text-3xl opacity-70">
                <span>♨️</span>
                <span>♨️</span>
                <span>♨️</span>
              </div>
              <div className="text-7xl">🍳</div>
              <p className="mt-4 max-w-md px-6 text-center text-lg font-bold">{stream.title}</p>
              {!isLive && (
                <p className="mt-2 text-sm text-stone-400">
                  {status === "scheduled"
                    ? `Эфир начнётся: ${stream.scheduledAt ? fmtDateTime(stream.scheduledAt) : "скоро"}`
                    : "Эфир завершён. Спасибо, что были с нами!"}
                </p>
              )}
            </div>
            <div className="absolute left-4 top-4 flex items-center gap-2">
              {isLive ? <LiveBadge /> : <span className="chip bg-stone-700 text-white">{status === "scheduled" ? "Скоро" : "Завершён"}</span>}
              {isLive && <span className="chip bg-black/50 text-white">👁 {viewers}</span>}
            </div>
            {/* Плавающие реакции */}
            <div className="pointer-events-none absolute bottom-4 right-6">
              {floats.map((f) => (
                <span key={f.id} className="absolute bottom-0 right-0 animate-[steam_2.5s_ease-out] text-3xl">
                  {f.emoji}
                </span>
              ))}
            </div>
          </div>

          {/* Закреплённое сообщение */}
          {stream.pinnedMessage && (
            <div className="card flex items-start gap-2 border-l-4 border-l-orange-500 p-4">
              <span>📌</span>
              <p className="text-sm font-semibold text-stone-700">{stream.pinnedMessage}</p>
            </div>
          )}

          {/* Карточка повара */}
          {chef && (
            <div className="card flex items-center justify-between gap-3 p-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-50 text-2xl">{chef.avatar}</span>
                <div className="min-w-0">
                  <Link href={`/chefs/${chef.id}`} className="font-bold hover:text-orange-600">
                    {chef.name}
                  </Link>
                  <p className="truncate text-xs text-stone-500">
                    {chef.cuisineEmoji} {chef.cuisineName} · {chef.specialization}
                  </p>
                  <Stars rating={chef.rating} size="text-xs" />
                </div>
              </div>
              <Link href={`/chefs/${chef.id}`} className="btn-secondary shrink-0 text-xs">
                Профиль
              </Link>
            </div>
          )}

          {/* AI-агент */}
          {analysis && (
            <div className="card border border-violet-200 bg-gradient-to-r from-violet-50 to-fuchsia-50 p-4">
              <div className="flex items-center gap-2">
                <span className="text-lg">🤖</span>
                <p className="text-xs font-bold uppercase tracking-wide text-violet-600">AI-агент анализирует эфир</p>
              </div>
              <p className="mt-2 text-sm text-stone-700">{analysis.summary}</p>
              {analysis.detected && (
                <div className="mt-3 flex items-center justify-between rounded-xl bg-white p-3 ring-1 ring-violet-100">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{analysis.detected.emoji}</span>
                    <div>
                      <p className="text-sm font-bold">{analysis.detected.name}</p>
                      <p className="text-[11px] text-violet-500">распознано · уверенность {analysis.detected.confidence}%</p>
                    </div>
                  </div>
                  {dishes.find((d) => d.id === analysis.detected!.id) && (
                    <button onClick={() => orderDish(dishes.find((d) => d.id === analysis.detected!.id)!)} className="btn-primary !py-1.5 text-xs">
                      Заказать
                    </button>
                  )}
                </div>
              )}
              {analysis.tags.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {analysis.tags.map((t) => (
                    <span key={t} className="chip bg-white text-violet-600 ring-1 ring-violet-100">#{t}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Блюда эфира */}
          {dishes.length > 0 && (
            <div>
              <h3 className="mb-3 font-bold">Блюда из этого эфира</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {dishes.map((d) => (
                  <div key={d.id} className="card flex items-center gap-3 p-3.5">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-2xl">{d.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{d.name}</p>
                      <p className="text-sm font-extrabold text-orange-600">{fmtFC(d.price)}</p>
                    </div>
                    <button onClick={() => orderDish(d)} className="btn-primary shrink-0 !py-1.5 text-xs">
                      🛒 Из эфира
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Правая колонка: чат */}
        <div className="card flex h-[640px] flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
            <p className="font-bold">Открытый чат</p>
            {isLive && <span className="chip bg-emerald-50 text-emerald-600">онлайн</span>}
          </div>
          <div ref={chatRef} className="flex-1 space-y-2.5 overflow-y-auto px-4 py-3">
            {messages.map((m) => (
              <div key={m.id} className="msg-in">
                {m.kind === "system" ? (
                  <p className="text-center text-[11px] text-stone-400">— {m.text} —</p>
                ) : m.kind === "reaction" ? (
                  <p className="text-sm">
                    <span className="font-semibold text-stone-500">{m.authorName}</span> отправил(а) {m.text}
                  </p>
                ) : (
                  <p className="text-sm leading-snug">
                    <span className={`font-semibold ${m.authorName === stream.chefName ? "text-orange-600" : "text-stone-500"}`}>
                      {m.authorName === stream.chefName ? `👨‍🍳 ${m.authorName}` : m.authorName}:
                    </span>{" "}
                    {m.text}
                  </p>
                )}
              </div>
            ))}
            {messages.length === 0 && <p className="pt-8 text-center text-sm text-stone-400">Сообщений пока нет</p>}
          </div>

          {isLive && (
            <div className="flex gap-1.5 border-t border-stone-100 px-3 pt-2">
              {REACTIONS.map((r) => (
                <button key={r} onClick={() => send(r, "reaction")} className="flex-1 rounded-xl bg-stone-50 py-1.5 text-lg hover:bg-orange-50" title="Быстрая реакция">
                  {r}
                </button>
              ))}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex gap-2 p-3"
          >
            <input
              className="input flex-1 !py-2"
              placeholder={!user ? "Войдите, чтобы писать в чат" : isLive ? "Ваше сообщение…" : "Чат закрыт"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={!isLive}
            />
            <button type="submit" className="btn-primary !px-3.5" disabled={!isLive || (!input.trim() && !!user)}>
              ➤
            </button>
          </form>
          {user && chef && user.id !== chef.userId && (
            <div className="border-t border-stone-100 px-3 py-2.5">
              <ChatRequestButton chefId={stream.chefId} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChatRequestButton({ chefId }: { chefId: number }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");

  const request = async () => {
    setState("busy");
    const res = await fetch("/api/chats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chefId }),
    });
    const data = await res.json();
    setState("done");
    if (res.ok && data.status === "active") router.push(`/chats/${data.chatId}`);
  };

  return state === "done" ? (
    <p className="text-center text-xs text-emerald-600">Запрос отправлен — повар получит его в кабинете ✅</p>
  ) : (
    <button onClick={request} disabled={state === "busy"} className="btn-secondary w-full !py-2 text-xs">
      💬 Запросить личный чат с поваром
    </button>
  );
}
