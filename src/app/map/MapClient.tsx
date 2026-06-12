"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { ChefCard, Cuisine } from "@/lib/types";
import { Stars, LiveBadge } from "@/components/ui";
import { PRICE_LEVELS, plural } from "@/lib/format";

const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-stone-100 text-stone-400">Загружаем карту…</div>
  ),
});

// Та же демо-точка «вы здесь», что и в MapView (импорт нельзя — MapView грузится динамически)
const USER_POINT: [number, number] = [55.7468, 37.6064];

const distKm = (a: [number, number], b: [number, number]) => {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};
const etaMin = (km: number) => Math.round(8 + km * 5);

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
      chefs
        .filter((c) => {
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
        })
        // В эфире — в начало «ленты тарифов», дальше по рейтингу
        .sort((a, b) => Number(Boolean(b.liveStreamId)) - Number(Boolean(a.liveStreamId)) || b.rating - a.rating),
    [chefs, filters]
  );

  const liveCount = filtered.filter((c) => c.liveStreamId).length;
  const sel = selected ? filtered.find((c) => c.id === selected) ?? chefs.find((c) => c.id === selected) : undefined;
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }));
  const hasFilters = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);

  return (
    <div className="relative h-[calc(100dvh-7.5rem)] w-full md:h-[calc(100dvh-4rem)]">
      <div className="absolute inset-0">
        <MapView chefs={filtered} selected={selected} onSelect={setSelected} />
      </div>

      {/* Поиск и фильтры поверх карты, как в такси */}
      <div className="absolute inset-x-3 top-3 z-[1000] space-y-2 md:left-4 md:right-auto md:w-[420px]">
        <label className="flex items-center gap-3 rounded-2xl bg-white px-4 shadow-lg ring-1 ring-stone-200/80">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-yellow-400 ring-4 ring-yellow-400/25" />
          <input
            className="w-full bg-transparent py-3.5 text-sm font-semibold outline-none placeholder:font-normal placeholder:text-stone-500"
            placeholder="Куда отправимся за вкусом?"
            value={filters.query}
            onChange={(e) => set("query", e.target.value)}
          />
          {loading ? (
            <span className="shrink-0 text-[11px] text-stone-400">ищем…</span>
          ) : (
            <span className="shrink-0 text-[11px] font-semibold text-stone-400">{filtered.length}</span>
          )}
        </label>

        <div className="flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Chip active={filters.onlyLive} onClick={() => set("onlyLive", !filters.onlyLive)}>
            <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-red-500" /> В эфире
          </Chip>
          <Chip active={filters.onlyAvailable} onClick={() => set("onlyAvailable", !filters.onlyAvailable)}>Принимает заказы</Chip>
          <Chip active={filters.delivery} onClick={() => set("delivery", !filters.delivery)}>Доставка</Chip>
          <Chip active={filters.pickup} onClick={() => set("pickup", !filters.pickup)}>Самовывоз</Chip>
          <Chip active={filters.minRating === 4.5} onClick={() => set("minRating", filters.minRating === 4.5 ? 0 : 4.5)}>4.5★+</Chip>
          {[1, 2, 3].map((p) => (
            <Chip key={p} active={filters.maxPrice === p} onClick={() => set("maxPrice", filters.maxPrice === p ? 0 : p)}>
              до {PRICE_LEVELS[p]}
            </Chip>
          ))}
          {cuisines.map((c) => (
            <Chip key={c.id} active={filters.cuisineId === c.id} onClick={() => set("cuisineId", filters.cuisineId === c.id ? 0 : c.id)}>
              {c.name}
            </Chip>
          ))}
          {hasFilters && (
            <Chip active={false} onClick={() => setFilters(DEFAULT_FILTERS)}>✕ Сбросить</Chip>
          )}
        </div>
      </div>

      {/* Нижняя шторка: лента поваров или карточка выбранного */}
      <div className="absolute inset-x-0 bottom-0 z-[1000] md:bottom-4 md:left-4 md:right-auto md:w-[420px]">
        {sel ? (
          <div className="rounded-t-2xl bg-white p-4 shadow-2xl ring-1 ring-stone-200/80 md:rounded-2xl">
            <div className="flex items-start gap-3">
              <span className="font-display flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-xl text-stone-900/60">
                {sel.name.trim().charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate font-bold">{sel.name}</p>
                  {sel.liveStreamId && <LiveBadge small />}
                </div>
                <p className="truncate text-xs text-stone-500">{sel.cuisineName} · {sel.specialization}</p>
                <div className="mt-1 flex items-center gap-2">
                  <Stars rating={sel.rating} size="text-xs" />
                  <span className="text-xs font-bold text-stone-400">{PRICE_LEVELS[sel.priceLevel]}</span>
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="shrink-0 rounded-lg p-1.5 text-stone-400 hover:bg-stone-100" title="Закрыть">
                ✕
              </button>
            </div>

            {/* Маршрут до кухни */}
            {sel.lat != null && sel.lng != null && (
              <div className="mt-3 flex items-center gap-3 rounded-xl bg-stone-50 px-3 py-2.5">
                <span className="h-2 w-2 shrink-0 rounded-full bg-yellow-400 ring-4 ring-yellow-400/25" />
                <span className="h-px flex-1 border-t-2 border-dashed border-stone-300" />
                <span className="h-2 w-2 shrink-0 rounded-[2px] bg-stone-950" />
                <span className="shrink-0 text-xs font-bold">
                  ~{etaMin(distKm(USER_POINT, [sel.lat, sel.lng]))} мин · {distKm(USER_POINT, [sel.lat, sel.lng]).toFixed(1)} км
                </span>
              </div>
            )}
            <p className="mt-2 text-xs text-stone-500">
              {sel.address} · {sel.available ? "принимает заказы" : "сейчас занят"}
              {sel.delivery ? " · доставка" : ""}{sel.pickup ? " · самовывоз" : ""}
            </p>

            <div className="mt-3 flex gap-2">
              {sel.liveStreamId && (
                <Link href={`/streams/${sel.liveStreamId}`} className="btn flex-1 bg-stone-950 !py-3 text-white hover:bg-stone-800">
                  Смотреть эфир
                </Link>
              )}
              <Link href={`/chefs/${sel.id}`} className="btn-primary flex-1 !py-3">
                Меню и заказ
              </Link>
            </div>
          </div>
        ) : (
          <div className="rounded-t-2xl bg-white pb-3 pt-4 shadow-2xl ring-1 ring-stone-200/80 md:rounded-2xl">
            <div className="flex items-baseline justify-between px-4">
              <p className="font-bold">
                {filtered.length} {plural(filtered.length, "повар", "повара", "поваров")} рядом
              </p>
              {liveCount > 0 && (
                <p className="text-xs font-bold text-red-600">{liveCount} в эфире</p>
              )}
            </div>
            {filtered.length === 0 && !loading ? (
              <p className="px-4 pb-3 pt-2 text-sm text-stone-500">Никто не подошёл под фильтры. Попробуйте смягчить условия.</p>
            ) : (
              <div className="mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {filtered.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelected(c.id)}
                    className="w-44 shrink-0 rounded-xl p-3 text-left ring-1 ring-stone-200 transition-colors hover:ring-stone-950"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-display flex h-9 w-9 items-center justify-center rounded-lg bg-orange-100 text-base text-stone-900/60">
                        {c.name.trim().charAt(0).toUpperCase()}
                      </span>
                      {c.liveStreamId ? <LiveBadge small /> : <span className="text-xs font-bold text-amber-600">★ {c.rating}</span>}
                    </div>
                    <p className="mt-2 truncate text-sm font-bold">{c.name}</p>
                    <p className="truncate text-[11px] text-stone-500">{c.cuisineName}</p>
                    <p className="mt-1 text-[11px] font-semibold text-stone-600">
                      {c.lat != null && c.lng != null ? `~${etaMin(distKm(USER_POINT, [c.lat, c.lng]))} мин` : "—"} · {PRICE_LEVELS[c.priceLevel]}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`chip shrink-0 whitespace-nowrap shadow-sm transition-colors ${
        active ? "bg-stone-950 text-white" : "bg-white text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50"
      }`}
    >
      {children}
    </button>
  );
}
