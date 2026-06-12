"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCart } from "@/components/cart";
import { fmtFC } from "@/lib/format";

export default function CartPage() {
  const cart = useCart();
  const router = useRouter();
  const [deliveryType, setDeliveryType] = useState<"delivery" | "pickup">("delivery");
  const [address, setAddress] = useState("");
  const [payment, setPayment] = useState<"wallet" | "card">("wallet");
  const [balance, setBalance] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        setLoggedIn(!!d.user);
        if (d.user) fetch("/api/wallet").then((r) => r.json()).then((w) => setBalance(w.balance ?? 0));
      });
  }, []);

  const checkout = async () => {
    setBusy(true);
    setError("");
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chefId: cart.chefId,
        items: cart.items.map((i) => ({ dishId: i.dishId, qty: i.qty })),
        deliveryType,
        address,
        payment,
        source: cart.source,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Не удалось оформить заказ");
    cart.clear();
    router.push(`/orders/${data.orderId}`);
  };

  if (cart.items.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <div className="mx-auto h-px w-12 bg-stone-300" />
        <h1 className="mt-6 text-2xl font-extrabold">Корзина пуста</h1>
        <p className="mt-2 text-sm text-stone-500">Загляните на карту поваров или в live-эфиры — там точно что-то готовится.</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/map" className="btn-primary">К карте</Link>
          <Link href="/streams" className="btn-secondary">К стримам</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-extrabold">Корзина</h1>
      <p className="mt-1 text-sm text-stone-500">
        Заказ у повара: <span className="font-semibold text-stone-700">{cart.chefName}</span>
        {cart.source === "stream" && <span className="ml-2 chip bg-red-50 text-red-600">из стрима</span>}
      </p>

      <div className="card mt-5 divide-y divide-stone-100">
        {cart.items.map((i) => (
          <div key={i.dishId} className="flex items-center gap-4 p-4">
            <span className="font-display flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-lg font-bold text-orange-700">
              {i.name.trim().charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-bold">{i.name}</p>
              <p className="text-sm text-stone-500">{fmtFC(i.price)} / шт</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => cart.setQty(i.dishId, i.qty - 1)} className="btn-secondary !h-8 !w-8 !p-0">−</button>
              <span className="w-6 text-center font-bold">{i.qty}</span>
              <button onClick={() => cart.setQty(i.dishId, i.qty + 1)} className="btn-secondary !h-8 !w-8 !p-0">+</button>
            </div>
            <p className="w-24 text-right font-extrabold">{fmtFC(i.price * i.qty)}</p>
          </div>
        ))}
      </div>

      <div className="card mt-4 space-y-5 p-6">
        <div>
          <label className="label">Способ получения</label>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setDeliveryType("delivery")} className={`btn ${deliveryType === "delivery" ? "bg-orange-500 text-white" : "bg-stone-100 text-stone-700"}`}>
              Доставка
            </button>
            <button onClick={() => setDeliveryType("pickup")} className={`btn ${deliveryType === "pickup" ? "bg-orange-500 text-white" : "bg-stone-100 text-stone-700"}`}>
              Самовывоз
            </button>
          </div>
        </div>

        {deliveryType === "delivery" && (
          <div>
            <label className="label">Адрес доставки</label>
            <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Город, улица, дом, квартира" />
          </div>
        )}

        <div>
          <label className="label">Оплата</label>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setPayment("wallet")} className={`btn flex-col !items-start ${payment === "wallet" ? "bg-orange-500 text-white" : "bg-stone-100 text-stone-700"}`}>
              <span>Кошелёк ForkCoins</span>
              {balance !== null && <span className="text-xs opacity-80">баланс: {fmtFC(balance)}</span>}
            </button>
            <button onClick={() => setPayment("card")} className={`btn ${payment === "card" ? "bg-orange-500 text-white" : "bg-stone-100 text-stone-700"}`}>
              Карта (демо)
            </button>
          </div>
        </div>

        <div className="space-y-1.5 border-t border-stone-100 pt-4 text-sm">
          <div className="flex justify-between text-stone-500">
            <span>Блюда ({cart.count})</span>
            <span>{fmtFC(cart.total)}</span>
          </div>
          <div className="flex justify-between text-stone-500">
            <span>Доставка</span>
            <span>{deliveryType === "delivery" ? "бесплатно" : "—"}</span>
          </div>
          <div className="flex justify-between text-base font-extrabold">
            <span>Итого</span>
            <span className="text-orange-600">{fmtFC(cart.total)}</span>
          </div>
          <p className="text-[11px] text-stone-400">Повар получит сумму за вычетом комиссии платформы 10%.</p>
        </div>

        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        {loggedIn === false ? (
          <Link href="/login" className="btn-primary w-full">
            Войдите, чтобы оформить заказ
          </Link>
        ) : (
          <button onClick={checkout} disabled={busy || (payment === "wallet" && balance !== null && balance < cart.total)} className="btn-primary w-full !py-3">
            {busy ? "Оформляем…" : payment === "wallet" && balance !== null && balance < cart.total ? "Недостаточно FC — пополните кошелёк" : `Оплатить ${fmtFC(cart.total)}`}
          </button>
        )}
      </div>
    </div>
  );
}
