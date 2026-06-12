"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { fmtFC, fmtDateTime } from "@/lib/format";

const TABS = [
  ["stats", "Аналитика"],
  ["users", "Пользователи"],
  ["complaints", "Жалобы"],
  ["reviews", "Отзывы"],
  ["requests", "Заявки"],
  ["categories", "Категории"],
] as const;

type Totals = {
  totalUsers: number; totalChefs: number; totalOrders: number; gmv: number; fees: number; avgCheck: number;
  liveStreams: number; totalStreams: number; streamViews: number; ordersFromStream: number;
  openComplaints: number; pendingRequests: number; chatsCount: number; messagesCount: number; conversion: number;
};

function Admin() {
  const params = useSearchParams();
  const tab = params.get("tab") ?? "stats";
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin?view=${tab}`);
    if (res.status === 401) return (window.location.href = "/login");
    const d = await res.json();
    if (!res.ok) return setError(d.error ?? "Нет доступа");
    setError("");
    setData(d);
  }, [tab]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  const act = async (body: Record<string, unknown>, okNote = "Готово") => {
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    setNote(res.ok ? okNote : (d.error ?? "Ошибка"));
    load();
  };

  if (error) return <div className="py-24 text-center text-stone-500">{error}</div>;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-extrabold">Админ-панель</h1>
      <p className="mt-1 text-sm text-stone-500">Модерация, пользователи, финансы и аналитика платформы.</p>

      <div className="mt-6 flex gap-1 overflow-x-auto border-b border-stone-200">
        {TABS.map(([key, label]) => (
          <Link
            key={key}
            href={`/admin?tab=${key}`}
            className={`whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-semibold ${tab === key ? "border-orange-500 text-orange-600" : "border-transparent text-stone-500 hover:text-stone-800"}`}
          >
            {label}
          </Link>
        ))}
      </div>

      {note && <p className="mt-4 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-700">{note}</p>}
      {!data && <div className="py-16 text-center text-stone-400">Загружаем…</div>}

      {data && tab === "stats" && <StatsView data={data as unknown as { totals: Totals; revenueByChef: { name: string; revenue: number; orders: number; rating: number }[]; trafficSources: { src: string; n: number }[]; ordersByDay: { day: string; n: number; sum: number }[] }} />}

      {data && tab === "users" && (
        <div className="card mt-6 divide-y divide-stone-100">
          {(data.users as { id: number; email: string; name: string; role: string; avatar: string; blocked: number; ordersCount: number; createdAt: string }[]).map((u) => (
            <div key={u.id} className="flex items-center gap-3 px-4 py-3">
              <span className="font-display flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-100 text-sm font-bold text-stone-600">
                {u.name.trim().charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {u.name}
                  <span className="ml-2 chip bg-stone-100 px-2 py-0.5 text-[10px] text-stone-500">
                    {u.role === "chef" ? "повар" : u.role === "admin" ? "админ" : "заказчик"}
                  </span>
                  {!!u.blocked && <span className="ml-1 chip bg-red-50 px-2 py-0.5 text-[10px] text-red-600">заблокирован</span>}
                </p>
                <p className="text-xs text-stone-400">{u.email} · заказов: {u.ordersCount}</p>
              </div>
              {u.role !== "admin" &&
                (u.blocked ? (
                  <button onClick={() => act({ action: "user_unblock", id: u.id }, "Пользователь разблокирован")} className="btn-secondary !py-1.5 text-xs">Разблокировать</button>
                ) : (
                  <button onClick={() => act({ action: "user_block", id: u.id }, "Пользователь заблокирован")} className="btn-danger !py-1.5 text-xs">Заблокировать</button>
                ))}
            </div>
          ))}
        </div>
      )}

      {data && tab === "complaints" && (
        <div className="mt-6 space-y-3">
          {(data.complaints as { id: number; targetType: string; targetId: number; reason: string; status: string; createdAt: string; authorName: string }[]).map((c) => (
            <div key={c.id} className="card flex items-center gap-3 border-l-4 border-l-red-400 p-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{c.reason}</p>
                <p className="text-xs text-stone-400">
                  {c.authorName} · объект: {c.targetType} #{c.targetId} · {fmtDateTime(c.createdAt)}
                </p>
              </div>
              {c.status === "open" ? (
                <div className="flex gap-2">
                  <button onClick={() => act({ action: "complaint_resolve", id: c.id }, "Жалоба решена")} className="btn-primary !py-1.5 text-xs">Решено</button>
                  <button onClick={() => act({ action: "complaint_dismiss", id: c.id }, "Жалоба отклонена")} className="btn-secondary !py-1.5 text-xs">Отклонить</button>
                </div>
              ) : (
                <span className="chip bg-stone-100 text-stone-500">{c.status === "resolved" ? "решена" : "отклонена"}</span>
              )}
            </div>
          ))}
          {(data.complaints as unknown[]).length === 0 && <p className="text-sm text-stone-500">Жалоб нет — отличный знак!</p>}
        </div>
      )}

      {data && tab === "reviews" && (
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {(data.reviews as { id: number; rating: number; text: string; status: string; createdAt: string; authorName: string; chefName: string }[]).map((r) => (
            <div key={r.id} className={`card p-4 ${r.status === "hidden" ? "opacity-60" : ""}`}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">{r.authorName} → {r.chefName}</p>
                <span className="text-sm text-amber-500">{"★".repeat(r.rating)}</span>
              </div>
              <p className="mt-2 text-sm text-stone-700">{r.text}</p>
              <div className="mt-3 flex items-center justify-between">
                <p className="text-[11px] text-stone-400">{fmtDateTime(r.createdAt)}</p>
                {r.status === "visible" ? (
                  <button onClick={() => act({ action: "review_hide", id: r.id }, "Отзыв скрыт")} className="btn-danger !py-1 text-xs">Скрыть</button>
                ) : (
                  <button onClick={() => act({ action: "review_show", id: r.id }, "Отзыв восстановлен")} className="btn-secondary !py-1 text-xs">Показать</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {data && tab === "requests" && (
        <div className="mt-6 space-y-3">
          {(data.requests as { id: number; message: string; specialization: string; status: string; createdAt: string; userName: string; email: string }[]).map((r) => (
            <div key={r.id} className="card p-4">
              <div className="flex items-center justify-between">
                <p className="font-semibold">{r.userName} <span className="text-xs text-stone-400">({r.email})</span></p>
                <span className={`chip px-2 py-0.5 text-[10px] ${r.status === "pending" ? "bg-amber-50 text-amber-600" : r.status === "approved" ? "bg-emerald-50 text-emerald-600" : "bg-stone-100 text-stone-500"}`}>
                  {r.status === "pending" ? "на рассмотрении" : r.status === "approved" ? "одобрена" : "отклонена"}
                </span>
              </div>
              <p className="mt-1 text-xs text-stone-400">Специализация: {r.specialization || "—"}</p>
              <p className="mt-2 text-sm text-stone-700">{r.message}</p>
              {r.status === "pending" && (
                <div className="mt-3 flex gap-2">
                  <button onClick={() => act({ action: "request_approve", id: r.id }, "Заявка одобрена — пользователь стал поваром")} className="btn-primary !py-1.5 text-xs">Одобрить</button>
                  <button onClick={() => act({ action: "request_reject", id: r.id }, "Заявка отклонена")} className="btn-secondary !py-1.5 text-xs">Отклонить</button>
                </div>
              )}
            </div>
          ))}
          {(data.requests as unknown[]).length === 0 && <p className="text-sm text-stone-500">Заявок нет.</p>}
        </div>
      )}

      {data && tab === "categories" && <CategoriesView categories={data.categories as { id: number; name: string; emoji: string; chefs: number }[]} act={act} />}
    </div>
  );
}

function StatsView({ data }: { data: { totals: Totals; revenueByChef: { name: string; revenue: number; orders: number; rating: number }[]; trafficSources: { src: string; n: number }[]; ordersByDay: { day: string; n: number; sum: number }[] } }) {
  const t = data.totals;
  return (
    <div className="mt-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Big label="Пользователи" value={String(t.totalUsers)} sub={`из них поваров: ${t.totalChefs}`} />
        <Big label="GMV (оборот)" value={fmtFC(t.gmv)} sub={`комиссия платформы: ${fmtFC(t.fees)}`} />
        <Big label="Заказы" value={String(t.totalOrders)} sub={`средний чек: ${fmtFC(t.avgCheck)}`} />
        <Big label="Конверсия стрим → заказ" value={`${t.conversion}%`} sub={`${t.ordersFromStream} заказов из эфиров`} />
        <Big label="Стримы" value={`${t.liveStreams} live`} sub={`всего эфиров: ${t.totalStreams} · просмотров: ${t.streamViews}`} />
        <Big label="Чаты" value={String(t.chatsCount)} sub={`сообщений всего: ${t.messagesCount}`} />
        <Big label="Открытые жалобы" value={String(t.openComplaints)} sub="ждут модерации" />
        <Big label="Заявки в повара" value={String(t.pendingRequests)} sub="на рассмотрении" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h3 className="font-bold">Выручка по поварам</h3>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-stone-400">
                <th className="pb-2">Повар</th><th className="pb-2 text-right">Заказы</th><th className="pb-2 text-right">Рейтинг</th><th className="pb-2 text-right">Оборот</th>
              </tr>
            </thead>
            <tbody>
              {data.revenueByChef.map((c) => (
                <tr key={c.name} className="border-t border-stone-100">
                  <td className="py-2 font-semibold">{c.name}</td>
                  <td className="py-2 text-right">{c.orders}</td>
                  <td className="py-2 text-right text-amber-500">★ {c.rating}</td>
                  <td className="py-2 text-right font-bold">{fmtFC(c.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-4">
          <div className="card p-5">
            <h3 className="font-bold">Источники трафика</h3>
            <div className="mt-3 space-y-2">
              {data.trafficSources.map((s) => {
                const max = Math.max(...data.trafficSources.map((x) => x.n), 1);
                return (
                  <div key={s.src} className="flex items-center gap-3 text-sm">
                    <span className="w-16 text-stone-500">{s.src}</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-stone-100">
                      <div className="h-full rounded-full bg-orange-400" style={{ width: `${(s.n / max) * 100}%` }} />
                    </div>
                    <span className="w-8 text-right font-bold">{s.n}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="card p-5">
            <h3 className="font-bold">Заказы по дням</h3>
            <div className="mt-3 flex h-24 items-end gap-1">
              {[...data.ordersByDay].reverse().map((d) => {
                const max = Math.max(...data.ordersByDay.map((x) => x.n), 1);
                return (
                  <div key={d.day} title={`${d.day}: ${d.n} заказов на ${fmtFC(d.sum)}`} className="flex-1 rounded-t bg-orange-300 transition-colors hover:bg-orange-500" style={{ height: `${(d.n / max) * 100}%`, minHeight: 4 }} />
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Big({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="card p-5">
      <p className="text-xs font-bold uppercase tracking-wide text-stone-400">{label}</p>
      <p className="font-display mt-2 text-2xl font-bold">{value}</p>
      <p className="mt-0.5 text-xs text-stone-500">{sub}</p>
    </div>
  );
}

function CategoriesView({ categories, act }: { categories: { id: number; name: string; emoji: string; chefs: number }[]; act: (b: Record<string, unknown>, n?: string) => void }) {
  const [name, setName] = useState("");
  return (
    <div className="mt-6 grid gap-4 md:grid-cols-[300px_1fr]">
      <div className="card h-fit space-y-3 p-5">
        <h3 className="font-bold">Новая категория</h3>
        <input className="input" placeholder="Название кухни" value={name} onChange={(e) => setName(e.target.value)} />
        <button onClick={() => { act({ action: "category_add", name }, "Категория добавлена"); setName(""); }} className="btn-primary w-full">Добавить</button>
      </div>
      <div className="card divide-y divide-stone-100">
        {categories.map((c) => (
          <div key={c.id} className="flex items-center gap-3 px-4 py-3">
            <span className="font-display flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-sm font-bold text-orange-700">
              {c.name.trim().charAt(0).toUpperCase()}
            </span>
            <p className="flex-1 font-semibold">{c.name}</p>
            <span className="text-xs text-stone-400">поваров: {c.chefs}</span>
            <button onClick={() => confirm(`Удалить категорию «${c.name}»?`) && act({ action: "category_delete", id: c.id }, "Категория удалена")} className="btn-danger !py-1 text-xs">✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminPage() {
  return (
    <Suspense>
      <Admin />
    </Suspense>
  );
}
