"use client";

import { useCallback, useEffect, useRef, useState, use } from "react";
import Link from "next/link";

type ChatInfo = {
  id: number;
  status: string;
  customerId: number;
  chefUserId: number;
  customerName: string;
  chefName: string;
  chefId: number;
};
type Msg = { id: number; senderId: number | null; text: string; createdAt: string };

export default function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [chat, setChat] = useState<ChatInfo | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [me, setMe] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/chats/${id}`);
    if (res.status === 401) return (window.location.href = "/login");
    const d = await res.json();
    if (!res.ok) return setError(d.error);
    setChat(d.chat);
    setMessages(d.messages);
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

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    const res = await fetch(`/api/chats/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: input }),
    });
    if (res.ok) {
      setInput("");
      load();
    } else setError((await res.json()).error ?? "Ошибка отправки");
  };

  const manage = async (action: string) => {
    await fetch(`/api/chats/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    load();
  };

  if (error && !chat) return <div className="py-24 text-center text-stone-500">{error}</div>;
  if (!chat) return <div className="py-24 text-center text-stone-400">Загружаем чат…</div>;

  const iAmChef = me === chat.chefUserId;
  const otherName = iAmChef ? chat.customerName : chat.chefName;
  const canWrite = chat.status === "active" || (chat.status === "pending" && iAmChef);

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-2xl flex-col px-4 py-6 sm:px-6">
      <div className="card flex items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <Link href="/chats" className="text-stone-400 hover:text-stone-600">←</Link>
          <div>
            <p className="font-bold">{otherName}</p>
            <p className="text-xs text-stone-400">
              {chat.status === "pending" ? "ожидает согласия повара" : chat.status === "active" ? "чат активен" : chat.status === "declined" ? "запрос отклонён" : "заблокирован"}
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
        {messages.map((m) =>
          m.senderId === null ? (
            <p key={m.id} className="text-center text-[11px] text-stone-400">— {m.text} —</p>
          ) : (
            <div key={m.id} className={`msg-in flex ${m.senderId === me ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-xl px-3.5 py-2 text-sm ${m.senderId === me ? "bg-stone-950 text-white" : "bg-stone-100 text-stone-900"}`}>
                {m.text}
              </div>
            </div>
          )
        )}
        <div ref={bottomRef} />
      </div>

      {error && <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

      <form onSubmit={send} className="mt-3 flex gap-2">
        <input
          className="input flex-1"
          placeholder={canWrite ? "Сообщение…" : chat.status === "pending" ? "Дождитесь согласия повара" : "Чат недоступен"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={!canWrite}
        />
        <button className="btn-primary" disabled={!canWrite}>→</button>
      </form>
    </div>
  );
}
