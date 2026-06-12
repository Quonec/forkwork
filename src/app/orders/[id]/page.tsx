"use client";

import { useCallback, useEffect, useState, use } from "react";
import Link from "next/link";
import type { OrderRow } from "@/lib/types";
import { ORDER_STATUS_RU, ORDER_FLOW } from "@/lib/types";
import { fmtFC, fmtDateTime } from "@/lib/format";

const STEP_NUM: Record<string, string> = { new: "1", accepted: "2", cooking: "3", delivering: "4", done: "5" };

export default function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [order, setOrder] = useState<(OrderRow & { hasReview?: boolean }) | null>(null);
  const [error, setError] = useState("");
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [reviewSent, setReviewSent] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/orders/${id}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setOrder(d.order);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  const sendReview = async () => {
    const res = await fetch(`/api/orders/${id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating, text }),
    });
    if (res.ok) {
      setReviewSent(true);
      load();
    } else setError((await res.json()).error ?? "Ошибка");
  };

  const cancel = async () => {
    if (!confirm("Отменить заказ? Деньги вернутся в кошелёк.")) return;
    await fetch(`/api/orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    });
    load();
  };

  if (error) return <div className="py-24 text-center text-stone-500">{error}</div>;
  if (!order) return <div className="py-24 text-center text-stone-400">Загружаем заказ…</div>;

  const stepIdx = ORDER_FLOW.indexOf(order.status);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <p className="text-xs font-bold uppercase tracking-widest text-stone-400">Заказ #{order.id}</p>
      <h1 className="mt-1 text-2xl font-extrabold">
        {order.status === "cancelled" ? "Заказ отменён" : ORDER_STATUS_RU[order.status]}
      </h1>
      <p className="mt-1 text-sm text-stone-500">
        Повар: <Link href={`/chefs/${order.chefId}`} className="font-semibold text-orange-600">{order.chefName}</Link> · {fmtDateTime(order.createdAt)}
      </p>

      {/* Маршрут заказа: как поездка — от точки А до двери */}
      {order.status !== "cancelled" && (
        <div className="card mt-5 p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Маршрут заказа</p>
          <div className="mt-3 flex items-center justify-between">
            {ORDER_FLOW.map((s, i) => {
              const finish = i === ORDER_FLOW.length - 1;
              return (
                <div key={s} className="flex flex-1 items-center">
                  <div className="flex flex-col items-center">
                    <span
                      className={`font-display flex h-10 w-10 items-center justify-center text-base ${
                        finish ? "rounded-xl" : "rounded-full"
                      } ${i <= stepIdx ? "bg-stone-950 text-white" : "bg-stone-100 text-stone-400"}`}
                    >
                      {STEP_NUM[s]}
                    </span>
                    <span className={`mt-1.5 text-[10px] font-semibold ${i <= stepIdx ? "text-stone-950" : "text-stone-400"}`}>
                      {ORDER_STATUS_RU[s]}
                    </span>
                  </div>
                  {i < ORDER_FLOW.length - 1 && (
                    <div className={`mx-1 h-1 flex-1 rounded ${i < stepIdx ? "bg-yellow-400" : "bg-stone-100"}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Состав */}
      <div className="card mt-4 divide-y divide-stone-100">
        {order.items.map((i) => (
          <div key={i.dishId} className="flex items-center gap-3 p-4">
            <span className="font-display flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-sm font-bold text-orange-700">
              {i.name.trim().charAt(0).toUpperCase()}
            </span>
            <p className="flex-1 text-sm font-semibold">{i.name}</p>
            <p className="text-sm text-stone-500">× {i.qty}</p>
            <p className="w-24 text-right text-sm font-bold">{fmtFC(i.price * i.qty)}</p>
          </div>
        ))}
        <div className="flex items-center justify-between p-4">
          <p className="text-sm text-stone-500">
            {order.deliveryType === "delivery" ? `Доставка: ${order.address}` : "Самовывоз"} · оплата:{" "}
            {order.payment === "wallet" ? "кошелёк" : "карта"}
          </p>
          <p className="text-lg font-extrabold text-orange-600">{fmtFC(order.total)}</p>
        </div>
      </div>

      {["new", "accepted"].includes(order.status) && (
        <button onClick={cancel} className="btn-danger mt-4 w-full">
          Отменить заказ (вернём {fmtFC(order.total)})
        </button>
      )}

      {/* Отзыв */}
      {order.status === "done" && !order.hasReview && !reviewSent && (
        <div className="card mt-6 p-6">
          <h2 className="font-bold">Оцените заказ</h2>
          <p className="mt-1 text-xs text-stone-500">Рейтинг влияет на позицию повара в поиске и на карте.</p>
          <div className="mt-3 flex gap-1 text-3xl">
            {[1, 2, 3, 4, 5].map((s) => (
              <button key={s} onClick={() => setRating(s)} className={s <= rating ? "text-amber-400" : "text-stone-200"}>
                ★
              </button>
            ))}
          </div>
          <textarea
            className="input mt-3 h-24 resize-none"
            placeholder="Что понравилось? Что улучшить?"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button onClick={sendReview} className="btn-primary mt-3 w-full">
            Отправить отзыв
          </button>
        </div>
      )}
      {(order.hasReview || reviewSent) && order.status === "done" && (
        <p className="mt-6 rounded-xl bg-emerald-50 px-4 py-3 text-center text-sm text-emerald-700">
          Спасибо за отзыв! Он уже учтён в рейтинге повара.
        </p>
      )}

      <div className="mt-6 text-center">
        <Link href="/cabinet?tab=orders" className="text-sm font-semibold text-orange-600">
          ← Все мои заказы
        </Link>
      </div>
    </div>
  );
}
