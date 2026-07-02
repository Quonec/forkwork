"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";

type Rec = { type: string; id: number; title: string; subtitle: string; emoji: string; href: string };
type OrderProposal = {
  dishId: number;
  name: string;
  price: number;
  emoji: string;
  chefId: number;
  chefName: string;
  delivery: number;
  pickup: number;
};
type Msg = { from: "user" | "ai"; text: string; recs?: Rec[]; order?: OrderProposal };

const SUGGESTIONS = ["Закажи карбонару", "Хочу острый суп", "Что-нибудь веганское", "Что сейчас в эфире?"];

export default function AIWidget() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([
    { from: "ai", text: "Здравствуйте! Я AI-агент ForkWork. Подскажу повара, блюдо, стрим или рецепт под ваше настроение. Что хочется?" },
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
      setMsgs((m) => [
        ...m,
        { from: "ai", text: data.reply ?? "Что-то пошло не так.", recs: data.recommendations, order: data.orderProposal ?? undefined },
      ]);
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
        className="font-display fixed bottom-20 right-5 z-[1200] flex h-14 w-14 items-center justify-center rounded-full bg-stone-950 text-lg text-white shadow-lg shadow-stone-950/25 transition-transform hover:scale-105 md:bottom-5"
        title="AI-агент ForkWork"
      >
        {open ? "✕" : "AI"}
      </button>

      {open && (
        <div className="fixed bottom-36 right-5 z-[1200] flex h-[460px] w-[min(380px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-stone-200 md:bottom-24 md:h-[480px]">
          <div className="flex items-center gap-2 bg-stone-950 px-4 py-3 text-white">
            <span className="font-display flex h-8 w-8 items-center justify-center rounded-lg bg-white/20 text-sm font-bold">AI</span>
            <div>
              <p className="text-sm font-bold leading-tight">AI-агент ForkWork</p>
              <p className="text-[11px] opacity-90">рекомендации · поиск · подсказки</p>
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
            {msgs.map((m, i) => (
              <div key={i} className={`msg-in flex ${m.from === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.from === "user" ? "bg-stone-950 text-white" : "bg-stone-100 text-stone-900"}`}>
                  {m.text}
                  {m.order && (
                    <OrderForm
                      order={m.order}
                      onDone={(text) => setMsgs((ms) => [...ms, { from: "ai", text }])}
                    />
                  )}
                  {m.recs && m.recs.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {m.recs.map((r) => (
                        <Link
                          key={`${r.type}-${r.id}`}
                          href={r.href}
                          onClick={() => setOpen(false)}
                          className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-2 ring-1 ring-stone-200 transition-colors hover:ring-stone-950"
                        >
                          <span className="font-display flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-orange-100 text-xs text-stone-900/60">
                            {r.title.trim().charAt(0).toUpperCase()}
                          </span>
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
                <button key={s} onClick={() => ask(s)} className="chip bg-stone-100 text-stone-700 hover:bg-stone-200">
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
              placeholder="Например: закажи острый рамён…"
              className="input flex-1 !py-2"
            />
            <button type="submit" disabled={busy || !input.trim()} className="btn-primary !px-3.5">
              →
            </button>
          </form>
        </div>
      )}
    </>
  );
}

// Оформление заказа прямо в чате: AI подобрал блюдо, пользователь подтверждает
function OrderForm({ order, onDone }: { order: OrderProposal; onDone: (text: string) => void }) {
  const [qty, setQty] = useState(1);
  const [deliveryType, setDeliveryType] = useState<"delivery" | "pickup">(order.delivery ? "delivery" : "pickup");
  const [address, setAddress] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    if (deliveryType === "delivery" && !address.trim()) {
      setError("Укажите адрес доставки");
      return;
    }
    setState("busy");
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chefId: order.chefId,
          items: [{ dishId: order.dishId, qty }],
          deliveryType,
          address: address.trim(),
          payment: "wallet",
          source: "ai",
        }),
      });
      const d = await res.json();
      if (res.status === 401) {
        setError("Войдите в аккаунт, чтобы оформить заказ");
        setState("idle");
        return;
      }
      if (!res.ok) {
        setError(d.error ?? "Не удалось оформить заказ");
        setState("idle");
        return;
      }
      setState("done");
      onDone(
        `Готово! Заказ #${d.orderId} на «${order.name}» ×${qty} оформлен — повар ${order.chefName} уже получил уведомление на кухне. Следить за статусом можно в разделе «Мои заказы».`
      );
    } catch {
      setError("Сервер недоступен, попробуйте ещё раз");
      setState("idle");
    }
  };

  if (state === "done") {
    return (
      <p className="mt-2 rounded-lg bg-emerald-50 px-2.5 py-2 text-xs font-semibold text-emerald-700">
        Заказ оформлен и отправлен повару
      </p>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg bg-white p-2.5 ring-1 ring-orange-200">
      <div className="flex items-center gap-2">
        <span className="font-display flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-orange-100 text-xs font-bold text-orange-700">
          {order.name.trim().charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold text-stone-800">{order.name}</p>
          <p className="text-[11px] text-stone-500">{order.chefName}</p>
        </div>
        <p className="text-xs font-extrabold text-orange-600">{order.price * qty} FC</p>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center rounded-lg bg-stone-100">
          <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="px-2 py-1 text-sm font-bold text-stone-600">−</button>
          <span className="w-6 text-center text-xs font-bold">{qty}</span>
          <button onClick={() => setQty((q) => Math.min(10, q + 1))} className="px-2 py-1 text-sm font-bold text-stone-600">+</button>
        </div>
        <div className="flex flex-1 gap-1">
          {order.delivery === 1 && (
            <button
              onClick={() => setDeliveryType("delivery")}
              className={`chip flex-1 justify-center ${deliveryType === "delivery" ? "bg-orange-500 text-white" : "bg-stone-100 text-stone-600"}`}
            >
              Доставка
            </button>
          )}
          {order.pickup === 1 && (
            <button
              onClick={() => setDeliveryType("pickup")}
              className={`chip flex-1 justify-center ${deliveryType === "pickup" ? "bg-orange-500 text-white" : "bg-stone-100 text-stone-600"}`}
            >
              Самовывоз
            </button>
          )}
        </div>
      </div>

      {deliveryType === "delivery" && (
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Адрес доставки"
          className="input !py-1.5 text-xs"
        />
      )}

      {error && <p className="text-[11px] font-semibold text-red-600">{error}</p>}

      <button onClick={submit} disabled={state === "busy"} className="btn-primary w-full !py-2 text-xs">
        {state === "busy" ? "Оформляем…" : `Заказать за ${order.price * qty} FC (кошелёк)`}
      </button>
    </div>
  );
}
