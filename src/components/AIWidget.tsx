"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";

type Rec = { type: string; id: number; title: string; subtitle: string; emoji: string; href: string };
type Msg = { from: "user" | "ai"; text: string; recs?: Rec[] };

const SUGGESTIONS = ["Хочу острый суп 🌶️", "Что-нибудь веганское", "Итальянская паста", "Что сейчас в эфире?"];

export default function AIWidget() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([
    { from: "ai", text: "Привет! Я AI-агент ForkWork 🤖 Подскажу повара, блюдо, стрим или рецепт под ваше настроение. Что хочется?" },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, open]);

  const ask = async (q: string) => {
    const query = q.trim();
    if (!query || busy) return;
    setMsgs((m) => [...m, { from: "user", text: query }]);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      setMsgs((m) => [...m, { from: "ai", text: data.reply ?? "Что-то пошло не так 😔", recs: data.recommendations }]);
    } catch {
      setMsgs((m) => [...m, { from: "ai", text: "Не получилось связаться с сервером. Попробуйте ещё раз." }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-5 right-5 z-[1200] flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-2xl shadow-lg shadow-orange-500/30 transition-transform hover:scale-105"
        title="AI-агент ForkWork"
      >
        {open ? "✕" : "🤖"}
      </button>

      {open && (
        <div className="fixed bottom-24 right-5 z-[1200] flex h-[480px] w-[min(380px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-stone-200">
          <div className="flex items-center gap-2 border-b border-stone-100 bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-3 text-white">
            <span className="text-xl">🤖</span>
            <div>
              <p className="text-sm font-bold leading-tight">AI-агент ForkWork</p>
              <p className="text-[11px] opacity-90">рекомендации · поиск · подсказки</p>
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
            {msgs.map((m, i) => (
              <div key={i} className={`msg-in flex ${m.from === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.from === "user" ? "bg-orange-500 text-white" : "bg-stone-100 text-stone-800"}`}>
                  {m.text}
                  {m.recs && m.recs.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {m.recs.map((r) => (
                        <Link
                          key={`${r.type}-${r.id}`}
                          href={r.href}
                          onClick={() => setOpen(false)}
                          className="flex items-center gap-2 rounded-xl bg-white px-2.5 py-2 ring-1 ring-stone-200 transition-colors hover:ring-orange-300"
                        >
                          <span className="text-lg">{r.emoji}</span>
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-semibold text-stone-800">{r.title}</span>
                            <span className="block truncate text-[11px] text-stone-500">{r.subtitle}</span>
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {busy && <div className="px-2 text-xs text-stone-400">AI-агент подбирает варианты…</div>}
            <div ref={bottomRef} />
          </div>

          {msgs.length <= 1 && (
            <div className="flex flex-wrap gap-1.5 px-3 pb-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => ask(s)} className="chip bg-orange-50 text-orange-700 ring-1 ring-orange-200 hover:bg-orange-100">
                  {s}
                </button>
              ))}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
            }}
            className="flex gap-2 border-t border-stone-100 p-2.5"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Например: острый рамён…"
              className="input flex-1 !py-2"
            />
            <button type="submit" disabled={busy || !input.trim()} className="btn-primary !px-3.5">
              ➤
            </button>
          </form>
        </div>
      )}
    </>
  );
}
