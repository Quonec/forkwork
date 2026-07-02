"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { ChefCard, OrderRow, SessionUser } from "@/lib/types";
import { fmtFC, fmtDateTime } from "@/lib/format";
import { ChefCardView } from "@/components/ChefCardView";
import { StatusChip } from "@/components/StatusChip";

type Tx = { id: number; type: string; amount: number; comment: string; createdAt: string };

const TABS = [
  ["overview", "Обзор"],
  ["orders", "Заказы"],
  ["favorites", "Избранное"],
  ["wallet", "Кошелёк"],
  ["become", "Стать поваром"],
] as const;

function Cabinet() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = params.get("tab") ?? "overview";

  const [user, setUser] = useState<SessionUser | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [favIds, setFavIds] = useState<number[]>([]);
  const [chefs, setChefs] = useState<ChefCard[]>([]);
  const [balance, setBalance] = useState(0);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [topup, setTopup] = useState(1000);
  const [reqStatus, setReqStatus] = useState<string | null>(null);
  const [reqMessage, setReqMessage] = useState("");
  const [reqSpec, setReqSpec] = useState("");
  const [note, setNote] = useState("");

  const loadAll = () => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => {
      if (!d.user) window.location.href = "/login";
      else setUser(d.user);
    });
    fetch("/api/orders").then((r) => r.json()).then((d) => setOrders(d.orders ?? []));
    fetch("/api/favorites").then((r) => r.json()).then((d) => setFavIds(d.chefIds ?? []));
    fetch("/api/chefs").then((r) => r.json()).then((d) => setChefs(d.chefs ?? []));
    fetch("/api/wallet").then((r) => r.json()).then((d) => {
      setBalance(d.balance ?? 0);
      setTxs(d.transactions ?? []);
    });
    fetch("/api/role-requests").then((r) => r.json()).then((d) => setReqStatus(d.request?.status ?? null));
  };

  useEffect(loadAll, []);

  const doTopup = async () => {
    const res = await fetch("/api/wallet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "topup", amount: topup }),
    });
    const d = await res.json();
    setNote(res.ok ? `Кошелёк пополнен на ${fmtFC(topup)}` : d.error);
    loadAll();
    router.refresh();
  };

  const sendRequest = async () => {
    const res = await fetch("/api/role-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: reqMessage, specialization: reqSpec }),
    });
    const d = await res.json();
    setNote(res.ok ? "Заявка отправлена! Администратор рассмотрит её в ближайшее время." : d.error);
    if (res.ok) setReqStatus("pending");
  };

  if (!user) return <div className="py-24 text-center text-stone-400">Загружаем кабинет…</div>;

  const favorites = chefs.filter((c) => favIds.includes(c.id));

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex items-center gap-4">
        <span className="font-display flex h-16 w-16 items-center justify-center rounded-xl bg-orange-100 text-2xl font-bold text-orange-800">
          {user.name.trim().charAt(0).toUpperCase()}
        </span>
        <div>
          <h1 className="text-2xl font-extrabold">{user.name}</h1>
          <p className="text-sm text-stone-500">{user.email} · {user.role === "chef" ? "повар" : user.role === "admin" ? "администратор" : "заказчик"}</p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-xs text-stone-400">Баланс</p>
          <p className="text-xl font-extrabold text-orange-600">{fmtFC(balance)}</p>
        </div>
      </div>

      <div className="mt-6 flex gap-1 overflow-x-auto border-b border-stone-200">
        {TABS.filter(([k]) => k !== "become" || user.role === "customer").map(([key, label]) => (
          <Link
            key={key}
            href={`/cabinet?tab=${key}`}
            className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold ${tab === key ? "border-yellow-400 text-stone-950" : "border-transparent text-stone-500 hover:text-stone-800"}`}
          >
            {label}
          </Link>
        ))}
      </div>

      {note && <p className="mt-4 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-700">{note}</p>}

      {tab === "overview" && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Заказов всего" value={String(orders.length)} />
          <StatCard label="В избранном" value={String(favorites.length)} />
          <StatCard label="Баланс" value={fmtFC(balance)} />
          <StatCard label="Активных заказов" value={String(orders.filter((o) => !["done", "cancelled"].includes(o.status)).length)} />
          <div className="card col-span-full overflow-hidden">
            <h3 className="px-5 pt-5 font-bold">Быстрые действия</h3>
            <div className="mt-2 divide-y divide-stone-100">
              {(
                [
                  ["/map", "Карта поваров"],
                  ["/streams", "Стримы"],
                  ["/chats", "Личные чаты"],
                  ["/cabinet?tab=wallet", "Пополнить кошелёк"],
                  ...(user.role === "chef" ? ([["/kitchen", "Поварской кабинет"]] as [string, string][]) : []),
                ] as [string, string][]
              ).map(([href, label]) => (
                <Link key={href} href={href} className="flex items-center justify-between px-5 py-3.5 text-sm font-semibold transition-colors hover:bg-stone-50">
                  {label}
                  <span className="text-lg text-stone-400">›</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "orders" && (
        <div className="mt-6 space-y-3">
          {orders.length === 0 && <p className="text-sm text-stone-500">Заказов пока нет — самое время это исправить.</p>}
          {orders.map((o) => (
            <Link key={o.id} href={`/orders/${o.id}`} className="card flex items-center gap-4 p-4 transition hover:ring-stone-400">
              <span className="font-display flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-base font-bold text-orange-700">
                {(o.items[0]?.name ?? o.chefName).trim().charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-bold">Заказ #{o.id} · {o.chefName}</p>
                <p className="truncate text-xs text-stone-500">
                  {o.items.map((i) => `${i.name} ×${i.qty}`).join(", ")}
                </p>
              </div>
              <div className="text-right">
                <StatusChip status={o.status} />
                <p className="mt-1 text-sm font-extrabold">{fmtFC(o.total)}</p>
                <p className="text-[10px] text-stone-400">{fmtDateTime(o.createdAt)}</p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {tab === "favorites" && (
        <div className="mt-6">
          {favorites.length === 0 ? (
            <p className="text-sm text-stone-500">Избранных поваров нет. Нажмите «В избранное» на профиле повара.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {favorites.map((c) => <ChefCardView key={c.id} chef={c} />)}
            </div>
          )}
        </div>
      )}

      {tab === "wallet" && (
        <div className="mt-6 grid gap-4 md:grid-cols-[300px_1fr]">
          <div className="card h-fit p-6">
            <p className="text-xs font-bold uppercase tracking-wide text-stone-400">Пополнение кошелька</p>
            <div className="mt-3 flex gap-1.5">
              {[500, 1000, 3000].map((v) => (
                <button key={v} onClick={() => setTopup(v)} className={`chip flex-1 justify-center ${topup === v ? "bg-orange-500 text-white" : "bg-stone-100 text-stone-600"}`}>
                  {v}
                </button>
              ))}
            </div>
            <input type="number" min={50} className="input mt-2" value={topup} onChange={(e) => setTopup(Number(e.target.value))} />
            <button onClick={doTopup} className="btn-primary mt-3 w-full">Пополнить на {fmtFC(topup)}</button>
            <p className="mt-2 text-[11px] text-stone-400">1 FC = 1 ₽. Лимит одной операции — 100 000 FC (антифрод).</p>
          </div>
          <div className="card divide-y divide-stone-100">
            <p className="p-4 text-xs font-bold uppercase tracking-wide text-stone-400">История операций</p>
            {txs.map((t) => (
              <div key={t.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-semibold">{t.comment}</p>
                  <p className="text-[11px] text-stone-400">{fmtDateTime(t.createdAt)}</p>
                </div>
                <p className={`font-extrabold ${t.amount > 0 ? "text-emerald-600" : "text-stone-700"}`}>
                  {t.amount > 0 ? "+" : ""}{fmtFC(t.amount)}
                </p>
              </div>
            ))}
            {txs.length === 0 && <p className="p-4 text-sm text-stone-500">Операций пока нет.</p>}
          </div>
        </div>
      )}

      {tab === "become" && user.role === "customer" && (
        <div className="card mt-6 max-w-xl p-6">
          <h3 className="text-lg font-bold">Стать поваром ForkWork</h3>
          {reqStatus === "pending" ? (
            <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
              Ваша заявка на рассмотрении у администратора. Мы сообщим о решении!
            </p>
          ) : reqStatus === "rejected" ? (
            <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
              Предыдущая заявка отклонена. Вы можете подать новую — расскажите о себе подробнее.
            </p>
          ) : null}
          {reqStatus !== "pending" && (
            <>
              <p className="mt-2 text-sm text-stone-500">
                Расскажите, что готовите и почему вам можно доверять. После одобрения откроется поварской кабинет.
              </p>
              <input className="input mt-4" placeholder="Специализация (например: грузинская кухня)" value={reqSpec} onChange={(e) => setReqSpec(e.target.value)} />
              <textarea className="input mt-3 h-28 resize-none" placeholder="О себе и своей кухне (минимум 20 символов)…" value={reqMessage} onChange={(e) => setReqMessage(e.target.value)} />
              <button onClick={sendRequest} className="btn-primary mt-3">Отправить заявку</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-5">
      <p className="font-display text-2xl font-bold text-stone-900">{value}</p>
      <p className="mt-1 text-xs uppercase tracking-wide text-stone-500">{label}</p>
    </div>
  );
}

export default function CabinetPage() {
  return (
    <Suspense>
      <Cabinet />
    </Suspense>
  );
}
