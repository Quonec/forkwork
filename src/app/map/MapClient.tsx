"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { ChefCard, Cuisine } from "@/lib/types";
import { Stars, LiveBadge } from "@/components/ui";
import { PRICE_LEVELS } from "@/lib/format";

const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center rounded-2xl bg-stone-100 text-stone-400">
      Загружаем карту…
    </div>
  ),
});

export type Filters = {
  cuisineId: number | 0;
  maxPrice: number; // 0 = любая
  minRating: number;
  onlyAvailable: boolean;
  onlyLive: boolean;
  delivery: boolean;
  pickup: boolean;
  query: string;
};

const DEFAULT_FILTERS: Filters = {
  cuisineId: 0, maxPrice: 0, minRating: 0,
  onlyAvailable: false, onlyLive: false, delivery: false, pickup: false, query: "",
};

export default function MapClient() {
  const [chefs, setChefs] = useState<ChefCard[]>([]);
  const [cuisines, setCuisines] = useState<Cuisine[]>([]);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selected, setSelected] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/chefs")
      .then((r) => r.json())
      .then((d) => {
        setChefs(d.chefs ?? []);
        setCuisines(d.cuisines ?? []);
        setLoading(false);
      });
  }, []);

  const filtered = useMemo(
    () =>
      chefs.filter((c) => {
        if (filters.cuisineId && c.cuisineId !== filters.cuisineId) return false;
        if (filters.maxPrice && c.priceLevel > filters.maxPrice) return false;
        if (filters.minRating && c.rating < filters.minRating) return false;
        if (filters.onlyAvailable && !c.available) return false;
        if (filters.onlyLive && !c.liveStreamId) return false;
        if (filters.delivery && !c.delivery) return false;
        if (filters.pickup && !c.pickup) return false;
        if (filters.query) {
          const q = filters.query.toLowerCase();
          if (!`${c.name} ${c.specialization} ${c.cuisineName}`.toLowerCase().includes(q)) return false;
        }
        return true;
      }),
    [chefs, filters]
  );

  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }));

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Карта поваров</h1>
          <p className="text-sm text-stone-500">
            {loading ? "Ищем поваров…" : `Найдено: ${filtered.length} из ${chefs.length}`}
          </p>
        </div>
        <input
          className="input max-w-xs"
          placeholder="Поиск: имя, кухня, блюдо…"
          value={filters.query}
          onChange={(e) => set("query", e.target.value)}
        />
      </div>

      {/* Фильтры */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select className="input !w-auto !py-2" value={filters.cuisineId} onChange={(e) => set("cuisineId", Number(e.target.value))}>
          <option value={0}>Все кухни</option>
          {cuisines.map((c) => (
            <option key={c.id} value={c.id}>
              {c.emoji} {c.name}
            </option>
          ))}
        </select>
        <select className="input !w-auto !py-2" value={filters.maxPrice} onChange={(e) => set("maxPrice", Number(e.target.value))}>
          <option value={0}>Любая цена</option>
          <option value={1}>До ₽</option>
          <option value={2}>До ₽₽</option>
          <option value={3}>До ₽₽₽</option>
        </select>
        <select className="input !w-auto !py-2" value={filters.minRating} onChange={(e) => set("minRating", Number(e.target.value))}>
          <option value={0}>Любой рейтинг</option>
          <option value={4}>4★ и выше</option>
          <option value={4.5}>4.5★ и выше</option>
        </select>
        <Toggle label="🟢 Доступен" active={filters.onlyAvailable} onClick={() => set("onlyAvailable", !filters.onlyAvailable)} />
        <Toggle label="🔴 Live-эфир" active={filters.onlyLive} onClick={() => set("onlyLive", !filters.onlyLive)} />
        <Toggle label="🛵 Доставка" active={filters.delivery} onClick={() => set("delivery", !filters.delivery)} />
        <Toggle label="🚶 Самовывоз" active={filters.pickup} onClick={() => set("pickup", !filters.pickup)} />
        <button onClick={() => setFilters(DEFAULT_FILTERS)} className="text-xs font-semibold text-stone-400 hover:text-orange-600">
          Сбросить
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="h-[540px] overflow-hidden rounded-2xl ring-1 ring-stone-200">
          <MapView chefs={filtered} selected={selected} onSelect={setSelected} />
        </div>

        {/* Список */}
        <div className="flex max-h-[540px] flex-col gap-3 overflow-y-auto pr-1">
          {filtered.length === 0 && !loading && (
            <div className="card p-6 text-center text-sm text-stone-500">
              Никто не подошёл под фильтры 😕 Попробуйте смягчить условия.
            </div>
          )}
          {filtered.map((c) => (
            <div
              key={c.id}
              onMouseEnter={() => setSelected(c.id)}
              className={`card cursor-pointer p-4 transition-all ${selected === c.id ? "ring-2 ring-orange-400" : ""}`}
            >
              <div className="flex items-start gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-2xl">
                  {c.avatar}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`/chefs/${c.id}`} className="truncate font-bold hover:text-orange-600">
                      {c.name}
                    </Link>
                    <span className="text-xs font-bold text-stone-400">{PRICE_LEVELS[c.priceLevel]}</span>
                  </div>
                  <p className="truncate text-xs text-stone-500">
                    {c.cuisineEmoji} {c.cuisineName} · {c.specialization}
                  </p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Stars rating={c.rating} size="text-xs" />
                    {c.liveStreamId && <LiveBadge small />}
                    {!c.available ? (
                      <span className="chip bg-stone-100 px-2 py-0.5 text-[10px] text-stone-500">занят</span>
                    ) : (
                      <span className="chip bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-600">принимает заказы</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <Link href={`/chefs/${c.id}`} className="btn-primary flex-1 !py-1.5 text-xs">
                  Меню и заказ
                </Link>
                {c.liveStreamId && (
                  <Link href={`/streams/${c.liveStreamId}`} className="btn-secondary !py-1.5 text-xs">
                    📺 В эфир
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Toggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`chip transition-colors ${active ? "bg-orange-500 text-white" : "bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50"}`}
    >
      {label}
    </button>
  );
}
