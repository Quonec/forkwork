"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { fmtFC, fmtDateTime, timeAgo } from "@/lib/format";
import { Stranded } from "@/components/ui";

const TABS = [
  ["overview", "Обзор"],
  ["chefs", "Мои повара"],
  ["clients", "Клиенты"],
  ["transfer", "Передача прав"],
] as const;

type Totals = {
  chefsCount: number; gmv: number; revenue: number; ordersCount: number; newOrders: number;
  liveNow: number; clientsCount: number; avgRating: number; openComplaints: number;
};
type Chef = {
  id: number; userId: number; name: string; email: string; blocked: number; available: number;
  specialization: string; cuisineName: string | null; priceLevel: number; liveStreamId: number | null;
  rating: number; reviewsCount: number; ordersCount: number; newOrders: number; revenue: number;
  wallet: number; lastOrderAt: string | null; dishesCount: number; kinds: string[];
};
type Client = {
  id: number; name: string; email: string; blocked: number; ordersCount: number;
  totalSpent: number; lastOrderAt: string | null; favChefs: number;
};
type ManagerOpt = { id: number; name: string; email: string; load: number };
type Assignment = { chefId: number; kind: string; chef: string };

const KIND_RU: Record<string, [string, string]> = {
  control: ["контроль", "bg-stone-950 text-white"],
  support: ["поддержка", "bg-amber-100 text-amber-700"],
};

function Manager() {
  const params = useSearchParams();
  const tab = params.get("tab") ?? "overview";
  // Ответ храним вместе с view, для которого он загружен: при быстром
  // переключении вкладок поздний ответ старой вкладки не попадёт в рендер
  // новой (иначе data.chefs от ответа overview — undefined и краш)
  const [loaded, setLoaded] = useState<{ view: string; data: Record<string, unknown> } | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  const view = tab === "transfer" ? "managers" : tab;

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/manager?view=${view}`);
      if (res.status === 401) return (window.location.href = "/login");
      const d = await res.json().catch(() => null);
      if (!res.ok || !d) return setError(d?.error ?? "Нет доступа");
      setError("");
      setLoaded({ view, data: d });
    } catch {
      setError("Сервер недоступен — обновите страницу");
    }
  }, [view]);

  useEffect(() => {
    load();
  }, [load]);

  // Данные показываем только если они от текущей вкладки
  const data = loaded && loaded.view === view ? loaded.data : null;

  const act = async (body: Record<string, unknown>, okNote = "Готово") => {
    const res = await fetch("/api/manager", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    setNote(res.ok ? okNote : (d.error ?? "Ошибка"));
    load();
  };

  if (error) return <Stranded title={error} hint="Кабинет менеджера доступен только пользователям с ролью «Менеджер»." />;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-extrabold">Кабинет менеджера</h1>
      <p className="mt-1 text-sm text-stone-500">Кураторство закреплённых поваров и их клиентов: аналитика, инструменты, передача прав.</p>

      <div className="mt-6 flex gap-1 overflow-x-auto border-b border-stone-200">
        {TABS.map(([key, label]) => (
          <Link
            key={key}
            href={`/manager?tab=${key}`}
            className={`whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-semibold ${tab === key ? "border-yellow-400 text-stone-950" : "border-transparent text-stone-500 hover:text-stone-800"}`}
          >
            {label}
          </Link>
        ))}
      </div>

      {note && <p className="mt-4 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-700">{note}</p>}
      {!data && <div className="py-16 text-center text-stone-400">Загружаем…</div>}

      {data && tab === "overview" && !!data.totals && (
        <Overview totals={data.totals as Totals} attention={(data.attention as { chef: string; chefId: number; issue: string }[]) ?? []} />
      )}
      {data && tab === "chefs" && <Chefs chefs={(data.chefs as Chef[]) ?? []} act={act} />}
      {data && tab === "clients" && <Clients clients={(data.clients as Client[]) ?? []} />}
      {data && tab === "transfer" && (
        <Transfer managers={(data.managers as ManagerOpt[]) ?? []} assignments={(data.assignments as Assignment[]) ?? []} act={act} />
      )}
    </div>
  );
}

function Overview({ totals: t, attention }: { totals: Totals; attention: { chef: string; chefId: number; issue: string }[] }) {
  return (
    <div className="mt-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Big label="Поваров под опекой" value={String(t.chefsCount)} sub={`в эфире сейчас: ${t.liveNow}`} />
        <Big label="Оборот портфеля" value={fmtFC(t.gmv)} sub={`доход поваров: ${fmtFC(t.revenue)}`} />
        <Big label="Заказы" value={String(t.ordersCount)} sub={`новых ждут: ${t.newOrders}`} />
        <Big label="Клиенты" value={String(t.clientsCount)} sub={`средний рейтинг: ★ ${t.avgRating}`} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="card p-5">
          <h3 className="font-bold">Точки внимания</h3>
          {attention.length === 0 ? (
            <p className="mt-2 text-sm text-stone-500">Всё спокойно: повара принимают заказы, рейтинги в норме.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {attention.map((a, i) => (
                <li key={i} className="flex items-center justify-between gap-3 rounded-xl bg-stone-50 px-3 py-2.5 text-sm">
                  <span><span className="font-semibold">{a.chef}</span> — {a.issue}</span>
                  <Link href={`/manager?tab=chefs`} className="shrink-0 text-xs font-semibold text-orange-600">к повару →</Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card p-5">
          <h3 className="font-bold">Открытые жалобы</h3>
          <p className="font-display mt-2 text-3xl font-bold">{t.openComplaints}</p>
          <p className="mt-1 text-xs text-stone-500">по вашим поварам — разберите во вкладке «Мои повара».</p>
        </div>
      </div>
    </div>
  );
}

function Chefs({ chefs, act }: { chefs: Chef[]; act: (b: Record<string, unknown>, n?: string) => void }) {
  if (chefs.length === 0)
    return <p className="mt-6 text-sm text-stone-500">За вами пока не закреплены повара. Их назначает администратор или передаёт другой менеджер.</p>;
  return (
    <div className="mt-6 space-y-3">
      {chefs.map((c) => (
        <div key={c.id} className="card p-4">
          <div className="flex flex-wrap items-start gap-3">
            <span className="font-display flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-xl text-stone-900/60">
              {c.name.trim().charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/chefs/${c.id}`} className="font-bold hover:text-orange-600">{c.name}</Link>
                {c.kinds.map((k) => (
                  <span key={k} className={`chip px-2 py-0.5 text-[10px] ${KIND_RU[k]?.[1] ?? "bg-stone-100"}`}>{KIND_RU[k]?.[0] ?? k}</span>
                ))}
                {c.liveStreamId && <span className="chip bg-red-600 px-2 py-0.5 text-[10px] text-white">LIVE</span>}
                {!!c.blocked && <span className="chip bg-red-50 px-2 py-0.5 text-[10px] text-red-600">заблокирован</span>}
              </div>
              <p className="truncate text-xs text-stone-500">{c.cuisineName ?? "—"} · {c.specialization || "без специализации"} · {c.email}</p>
            </div>
            <div className="text-right">
              <p className="font-display text-lg font-bold">{fmtFC(c.revenue)}</p>
              <p className="text-[11px] text-stone-400">доход · баланс {fmtFC(c.wallet)}</p>
            </div>
          </div>

          {/* Глубокие метрики */}
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Metric label="Рейтинг" value={`★ ${c.rating}`} sub={`${c.reviewsCount} отз.`} />
            <Metric label="Заказы" value={String(c.ordersCount)} sub={c.newOrders ? `${c.newOrders} новых` : "новых нет"} highlight={!!c.newOrders} />
            <Metric label="Блюд активно" value={String(c.dishesCount)} sub="в меню" />
            <Metric label="Приём заказов" value={c.available ? "вкл" : "выкл"} sub={c.available ? "доступен" : "на паузе"} highlight={!c.available} />
            <Metric label="Последний заказ" value={c.lastOrderAt ? timeAgo(c.lastOrderAt) : "—"} sub="активность" />
          </div>

          {/* Быстрые инструменты */}
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => act({ action: "chef_availability", chefId: c.id, available: !c.available }, c.available ? "Приём заказов выключен" : "Приём заказов включён")} className="btn-secondary !py-1.5 text-xs">
              {c.available ? "Поставить на паузу" : "Включить приём"}
            </button>
            {c.liveStreamId && (
              <>
                <button
                  onClick={() => { const text = prompt("Промо для закрепления в эфире:"); if (text) act({ action: "stream_pin", chefId: c.id, text }, "Промо закреплено в эфире"); }}
                  className="btn-secondary !py-1.5 text-xs"
                >
                  Закрепить промо
                </button>
                <button onClick={() => confirm(`Остановить эфир повара ${c.name}?`) && act({ action: "stream_stop", streamId: c.liveStreamId }, "Эфир остановлен")} className="btn-danger !py-1.5 text-xs">
                  Остановить эфир
                </button>
              </>
            )}
            <button onClick={() => act({ action: "chef_bonus", chefId: c.id }, "Начислен маркетинг-бонус +200 FC")} className="btn-primary !py-1.5 text-xs">
              Бонус поддержки +200 FC
            </button>
            <Link href={`/chefs/${c.id}`} className="btn-ghost !py-1.5 text-xs">Профиль →</Link>
          </div>
        </div>
      ))}
    </div>
  );
}

function Clients({ clients }: { clients: Client[] }) {
  if (clients.length === 0)
    return <p className="mt-6 text-sm text-stone-500">У ваших поваров пока нет заказов от клиентов.</p>;
  return (
    <div className="card mt-6 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-100 text-left text-xs uppercase tracking-wide text-stone-400">
            <th className="px-4 py-3">Клиент</th>
            <th className="px-4 py-3 text-right">Заказов</th>
            <th className="px-4 py-3 text-right">Потрачено</th>
            <th className="px-4 py-3 text-right">В избранном</th>
            <th className="px-4 py-3 text-right">Последний заказ</th>
          </tr>
        </thead>
        <tbody>
          {clients.map((c) => (
            <tr key={c.id} className="border-b border-stone-50 last:border-0">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <span className="font-display flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-100 text-sm text-stone-600">
                    {c.name.trim().charAt(0).toUpperCase()}
                  </span>
                  <div>
                    <p className="font-semibold">{c.name} {!!c.blocked && <span className="chip bg-red-50 px-1.5 text-[10px] text-red-600">блок</span>}</p>
                    <p className="text-[11px] text-stone-400">{c.email}</p>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 text-right font-semibold">{c.ordersCount}</td>
              <td className="px-4 py-3 text-right font-bold">{fmtFC(c.totalSpent)}</td>
              <td className="px-4 py-3 text-right">{c.favChefs}</td>
              <td className="px-4 py-3 text-right text-stone-500">{c.lastOrderAt ? fmtDateTime(c.lastOrderAt) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Transfer({ managers, assignments, act }: { managers: ManagerOpt[]; assignments: Assignment[]; act: (b: Record<string, unknown>, n?: string) => void }) {
  const [target, setTarget] = useState<Record<string, number>>({});
  if (managers.length === 0)
    return <p className="mt-6 text-sm text-stone-500">Других менеджеров в системе нет — передавать права некому.</p>;

  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_280px]">
      <div className="card overflow-hidden">
        <h3 className="px-5 pt-5 font-bold">Мои права на поваров</h3>
        <p className="px-5 pb-3 pt-1 text-xs text-stone-500">Передайте контроль или поддержку другому менеджеру — например, на время отпуска.</p>
        {assignments.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-stone-500">У вас нет активных назначений.</p>
        ) : (
          <div className="divide-y divide-stone-100">
            {assignments.map((a) => {
              const key = `${a.chefId}-${a.kind}`;
              return (
                <div key={key} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{a.chef}</p>
                    <span className={`chip px-2 py-0.5 text-[10px] ${KIND_RU[a.kind]?.[1] ?? "bg-stone-100"}`}>{KIND_RU[a.kind]?.[0] ?? a.kind}</span>
                  </div>
                  <select
                    className="input !w-auto !py-1.5 text-sm"
                    value={target[key] ?? ""}
                    onChange={(e) => setTarget((p) => ({ ...p, [key]: Number(e.target.value) }))}
                  >
                    <option value="">— кому передать —</option>
                    {managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  <button
                    disabled={!target[key]}
                    onClick={() => act({ action: "transfer", chefId: a.chefId, kind: a.kind, toManagerId: target[key] }, "Права переданы")}
                    className="btn-primary !py-1.5 text-xs"
                  >
                    Передать
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card h-fit p-5">
        <h3 className="font-bold">Коллеги-менеджеры</h3>
        <div className="mt-3 space-y-2">
          {managers.map((m) => (
            <div key={m.id} className="flex items-center gap-2.5 rounded-xl bg-stone-50 px-3 py-2">
              <span className="font-display flex h-8 w-8 items-center justify-center rounded-full bg-stone-200 text-sm text-stone-600">
                {m.name.trim().charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{m.name}</p>
                <p className="text-[11px] text-stone-400">назначений: {m.load}</p>
              </div>
            </div>
          ))}
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

function Metric({ label, value, sub, highlight }: { label: string; value: string; sub: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl px-3 py-2 ${highlight ? "bg-amber-50" : "bg-stone-50"}`}>
      <p className="text-[10px] uppercase tracking-wide text-stone-400">{label}</p>
      <p className={`font-display text-base font-bold ${highlight ? "text-amber-700" : ""}`}>{value}</p>
      <p className="text-[10px] text-stone-400">{sub}</p>
    </div>
  );
}

export default function ManagerPage() {
  return (
    <Suspense>
      <Manager />
    </Suspense>
  );
}
