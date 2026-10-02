"use client";

import { useEffect, useMemo, useState } from "react";

import { OSM_CATEGORIES } from "@/lib/venues/categories";
import { SEGMENTS } from "@/lib/venues/themes";
import VenueTags from "@/components/VenueTags";
import { PhotoSection } from "@/components/VenuePhotos";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { ChefCard, Cuisine } from "@/lib/types";
import { Stars, LiveBadge } from "@/components/ui";
import { PRICE_LEVELS, plural } from "@/lib/format";
import type { Brand } from "@/lib/venues/types";
import type { VenueDto } from "@/lib/venues/ratings";
import OsmRatings from "@/components/OsmRatings";
import { RatingSources, RatingSpectrum } from "@/components/RatingSpectrum";
import KitchenTabs from "@/components/KitchenTabs";
import type { OsmVenue } from "@/lib/venues/osm";

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
  const [venues, setVenues] = useState<VenueDto[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [showOsm, setShowOsm] = useState(false);
  const [osm, setOsm] = useState<OsmVenue[]>([]);
  const [osmTotal, setOsmTotal] = useState(0);
  const [bbox, setBbox] = useState<[number, number, number, number] | null>(null);
  const [selectedOsm, setSelectedOsm] = useState<OsmVenue | null>(null);
  const [showVenues, setShowVenues] = useState(true);
  const [selectedVenue, setSelectedVenue] = useState<string | null>(null);
  const [tabsOpen, setTabsOpen] = useState(true);
  const [mapTab, setMapTab] = useState<MapTab>("near");
  const [themeFilter, setThemeFilter] = useState("");
  const [segFilter, setSegFilter] = useState("");
  const [segExact, setSegExact] = useState(false);
  const [nearby, setNearby] = useState<NearItem[]>([]);

  useEffect(() => {
    fetch("/api/chefs")
      .then((r) => r.json())
      .then((d) => {
        setChefs(d.chefs ?? []);
        setCuisines(d.cuisines ?? []);
        setLoading(false);
      });
    fetch("/api/venues")
      .then((r) => r.json())
      .then((d: { venues: VenueDto[]; brands: Brand[] }) => {
        setVenues(d.venues ?? []);
        setBrands(d.brands ?? []);
        const wanted = new URLSearchParams(window.location.search).get("venue");
        if (wanted && (d.venues ?? []).some((v) => v.id === wanted)) setSelectedVenue(wanted);
      })
      .catch(() => undefined);
  }, []);

  // Все заведения Москвы из OpenStreetMap в видимой области карты
  useEffect(() => {
    if (!showOsm || !bbox) return;
    const ac = new AbortController();
    const extra = `${themeFilter ? `&cat=${themeFilter}` : ""}${segFilter ? `&segment=${segFilter}` : ""}${segFilter && segExact ? "&exact=1" : ""}`;
    fetch(`/api/venues/osm?bbox=${bbox.map((n) => n.toFixed(5)).join(",")}&limit=400${extra}`, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { total: number; venues: OsmVenue[] } | null) => {
        if (!d) return;
        setOsm(d.venues);
        setOsmTotal(d.total);
      })
      .catch(() => undefined);
    return () => ac.abort();
  }, [showOsm, bbox, themeFilter, segFilter, segExact]);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("osm");
    if (!id) return;
    fetch(`/api/venues/osm?id=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { venue: OsmVenue } | null) => d && setSelectedOsm(d.venue))
      .catch(() => undefined);
  }, []);

  const shownOsm = useMemo(() => {
    if (!showOsm) return [];
    return selectedOsm && !osm.some((o) => o.id === selectedOsm.id) ? [...osm, selectedOsm] : osm;
  }, [showOsm, osm, selectedOsm]);
  const selectOsm = (id: string | null) => {
    const v = id ? shownOsm.find((o) => o.id === id) ?? null : null;
    setSelectedOsm(v);
    if (v) {
      setSelected(null);
      setSelectedVenue(null);
    }
  };

  const shownVenues = showVenues
    ? venues.filter((v) => (!themeFilter || v.themes.some((t) => t.id === themeFilter)) && (!segFilter || (v.segment.id === segFilter && (!segExact || v.segment.basis !== "type"))))
    : [];
  const selVenue = selectedVenue ? venues.find((v) => v.id === selectedVenue) : undefined;
  const selectChef = (id: number | null) => {
    setSelected(id);
    if (id !== null) {
      setSelectedVenue(null);
      setSelectedOsm(null);
    }
  };
  const selectVenue = (id: string | null) => {
    setSelectedVenue(id);
    if (id !== null) {
      setSelected(null);
      setSelectedOsm(null);
    }
  };

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

  // Ближайшие к выбранному заведению: избранные считаем здесь, остальные спрашиваем у базы
  const origin = selectedOsm
    ? { lat: selectedOsm.lat, lng: selectedOsm.lng, id: selectedOsm.id, name: selectedOsm.name, themes: selectedOsm.themes.map((t) => t.id), segment: selectedOsm.segment?.id ?? "" }
    : selVenue
      ? { lat: selVenue.lat, lng: selVenue.lng, id: selVenue.id, name: selVenue.name, themes: selVenue.themes.map((t) => t.id), segment: selVenue.segment.id }
      : null;
  useEffect(() => {
    if (!origin) {
      setNearby([]);
      return;
    }
    const ac = new AbortController();
    const by = mapTab === "theme" ? `&themes=${origin.themes.join(",")}` : mapTab === "price" ? `&segment=${origin.segment}` : "";
    if ((mapTab === "theme" && origin.themes.length === 0) || (mapTab === "price" && !origin.segment)) {
      setNearby([]);
      return;
    }
    fetch(`/api/venues/osm?near=${origin.lat},${origin.lng}&limit=12&exclude=${encodeURIComponent(origin.id)}${by}`, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { venues: (OsmVenue & { meters: number })[] } | null) => {
        const own: NearItem[] = venues
          .filter((v) => v.id !== origin.id)
          .filter((v) => (mapTab === "theme" ? v.themes.some((t) => origin.themes.includes(t.id)) : mapTab === "price" ? v.segment.id === origin.segment : true))
          .map((v) => ({ kind: "top" as const, id: v.id, name: v.name, meters: Math.round(distKm([origin.lat, origin.lng], [v.lat, v.lng]) * 1000), line: v.facts[0] ?? "", spectrum: v.spectrum, venue: v }))
          .filter((x) => x.meters <= 3000);
        const plain = (x: string) => x.toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9]/g, "");
        const same = (a: string, b: string) => plain(a).length > 2 && (plain(a).includes(plain(b)) || plain(b).includes(plain(a)));
        const rest: NearItem[] = (d?.venues ?? [])
          .filter((v) => !(same(v.name, origin.name) && v.meters < 200) && !own.some((o) => same(v.name, o.name) && Math.abs(o.meters - v.meters) < 200))
          .map((v) => ({ kind: "osm" as const, id: v.id, name: v.name, meters: v.meters, line: v.kindLabel, spectrum: null, osm: v }));
        setNearby([...own, ...rest].sort((a, b) => a.meters - b.meters).slice(0, 12));
      })
      .catch(() => undefined);
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin?.id, venues.length, mapTab]);
  const anySelected = Boolean(selectedOsm || selVenue || selected);
  const showTabs = tabsOpen && !anySelected;

  const liveCount = filtered.filter((c) => c.liveStreamId).length;
  const sel = selected ? filtered.find((c) => c.id === selected) ?? chefs.find((c) => c.id === selected) : undefined;
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }));
  const hasFilters = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);

  return (
    <div className="relative h-[calc(100dvh-7.5rem)] w-full md:h-[calc(100dvh-4rem)]">
      <div className="absolute inset-0">
        <MapView
          chefs={filtered}
          selected={selected}
          onSelect={selectChef}
          venues={shownVenues}
          selectedVenue={selectedVenue}
          onSelectVenue={selectVenue}
          osm={shownOsm}
          selectedOsm={selectedOsm?.id ?? null}
          onSelectOsm={selectOsm}
          onBounds={setBbox}
        />
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
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setTabsOpen((v) => !v);
            }}
            className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold text-stone-500 hover:bg-stone-100"
            aria-expanded={showTabs}
            title={showTabs ? "Скрыть вкладки" : "Показать вкладки"}
          >
            {showTabs ? "Скрыть ▴" : "Вкладки ▾"}
          </button>
        </label>

        {showTabs && <MapTabs tab={mapTab} onTab={setMapTab} />}
        {showTabs && mapTab === "theme" && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Chip active={themeFilter === ""} onClick={() => setThemeFilter("")}>
              Любая тематика
            </Chip>
            {OSM_CATEGORIES.map((c) => (
              <Chip key={c.id} active={themeFilter === c.id} onClick={() => setThemeFilter(themeFilter === c.id ? "" : c.id)}>
                {c.label}
              </Chip>
            ))}
          </div>
        )}
        {showTabs && mapTab === "price" && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Chip active={segFilter === ""} onClick={() => setSegFilter("")}>
              Любой чек
            </Chip>
            {SEGMENTS.map((g) => (
              <Chip key={g.id} active={segFilter === g.id} onClick={() => setSegFilter(segFilter === g.id ? "" : g.id)}>
                {g.label} · {g.range}
              </Chip>
            ))}
            <Chip active={segExact} onClick={() => setSegExact((v) => !v)}>
              Только по чеку
            </Chip>
          </div>
        )}
        <div className={`${showTabs && mapTab === "near" ? "flex" : "hidden"} gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}>
          <Chip active={showVenues} onClick={() => setShowVenues((v) => !v)}>
            Избранное{venues.length > 0 ? ` · ${venues.length}` : ""}
          </Chip>
          <Chip active={showOsm} onClick={() => setShowOsm((v) => !v)}>
            Все заведения{showOsm && osmTotal > 0 ? ` · ${osmTotal > osm.length ? `${osm.length} из ${osmTotal}` : osmTotal}` : ""}
          </Chip>
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
      <div className="absolute inset-x-0 bottom-9 z-[1000] flex max-h-[calc(100dvh-15rem)] flex-col md:bottom-4 md:left-4 md:right-auto md:max-h-[calc(100dvh-9rem)] md:w-[420px]">
        {origin && (
          <NearbyStrip
            tab={mapTab}
            onTab={setMapTab}
            items={nearby}
            onPick={(it) => {
              if (it.kind === "top") selectVenue(it.id);
              else if (it.osm) {
                setSelectedOsm(it.osm);
                setSelected(null);
                setSelectedVenue(null);
              }
            }}
          />
        )}
        <div className="min-h-0 overflow-y-auto rounded-t-2xl md:rounded-2xl">
        {selectedOsm ? (
          <OsmSheet venue={selectedOsm} onClose={() => setSelectedOsm(null)} />
        ) : selVenue ? (
          <VenueSheet venue={selVenue} brand={brands.find((b) => b.id === selVenue.brandId)} onClose={() => setSelectedVenue(null)} />
        ) : sel ? (
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
    </div>
  );
}

const osmLink = (v: OsmVenue) => `https://yandex.ru/search/?text=${encodeURIComponent(`${v.name} ${v.address} Москва меню`.trim())}`;

function OsmSheet({ venue, onClose }: { venue: OsmVenue; onClose: () => void }) {
  return (
    <div className="rounded-t-2xl bg-white p-4 shadow-2xl ring-1 ring-stone-200/80 md:rounded-2xl">
      <div className="flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-orange-300 text-stone-950">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="6" />
            <circle cx="12" cy="12" r="2.5" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{venue.name}</p>
          <ul className="mt-0.5 space-y-0.5 text-xs text-stone-500">
            {venue.facts.slice(0, 4).map((f) => (
              <li key={f}>
                {f}
              </li>
            ))}
          </ul>
          <VenueTags themes={venue.themes} segment={venue.segment} themeBasis={venue.themeBasis} />
        </div>
        <button onClick={onClose} className="shrink-0 rounded-lg p-1.5 text-stone-400 hover:bg-stone-100" title="Закрыть">
          ✕
        </button>
      </div>
      <details className="mt-2 rounded-lg bg-orange-50 px-3 py-2 text-xs text-stone-700">
        <summary className="cursor-pointer font-semibold text-orange-800">О кухне</summary>
        <ul className="mt-1 list-disc space-y-1 pl-4">
          {venue.cuisineFacts.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </details>
      <div className="mt-3 flex gap-2">
        {venue.menuUrl ? (
          <a href={venue.menuUrl} target="_blank" rel="noopener noreferrer" className="btn-primary flex-1 !py-3">
            Меню на сайте
          </a>
        ) : venue.website ? (
          <a href={venue.website} target="_blank" rel="noopener noreferrer" className="btn-primary flex-1 !py-3">
            Сайт заведения
          </a>
        ) : (
          <a href={osmLink(venue)} target="_blank" rel="noopener noreferrer" className="btn-secondary flex-1 !py-3">
            Найти меню в поиске
          </a>
        )}
        {(venue.menuUrl || venue.website) && (
          <a href={osmLink(venue)} target="_blank" rel="noopener noreferrer" className="btn-secondary flex-1 !py-3">
            Найти в поиске
          </a>
        )}
      </div>
      <div className="mt-3">
        <OsmRatings name={venue.name} address={venue.address} />
      </div>
      <div className="mt-3">
        <PhotoSection venueKey={venue.id} name={venue.name} />
      </div>
      <p className="mt-1 text-[11px] text-stone-400">Данные © участники OpenStreetMap; факты вычислены из этих данных и координат.</p>
    </div>
  );
}

function VenueSheet({ venue, onClose }: { venue: VenueDto; brand?: Brand; onClose: () => void }) {
  return (
    <div className="rounded-t-2xl bg-white p-4 shadow-2xl ring-1 ring-stone-200/80 md:rounded-2xl">
      <div className="flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-orange-500 text-stone-950">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="6" />
            <circle cx="12" cy="12" r="2.5" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{venue.name}</p>
          <ul className="mt-0.5 space-y-0.5 text-xs text-stone-500">
            {venue.facts.slice(0, 3).map((f) => (
              <li key={f}>
                {f}
              </li>
            ))}
          </ul>
          <VenueTags themes={venue.themes} segment={venue.segment} themeBasis="tag" />
        </div>
        <button onClick={onClose} className="shrink-0 rounded-lg p-1.5 text-stone-400 hover:bg-stone-100" title="Закрыть">
          ✕
        </button>
      </div>
      {venue.spectrum && (
        <div className="mt-3 rounded-xl bg-orange-50 p-3">
          <RatingSpectrum spectrum={venue.spectrum} compact />
        </div>
      )}
      <div className="mt-3">
        <PhotoSection venueKey={venue.id} name={venue.name} sources={venue.sourcePhotos} />
      </div>
      <KitchenTabs facts={venue.cuisineFacts} chefs={venue.chefs.length > 0 ? venue.chefs : undefined} compact />
      <div className="mt-3">
        <RatingSources name={venue.name} address={venue.address} spectrum={venue.spectrum} />
      </div>
      <div className="mt-3 flex gap-2">
        <a href={venue.menuUrl} target="_blank" rel="noopener noreferrer" className="btn-primary flex-1 !py-3">
          Меню
        </a>
        <a href={venue.website} target="_blank" rel="noopener noreferrer" className="btn-secondary flex-1 !py-3">
          Сайт
        </a>
      </div>
      <p className="mt-2 text-xs text-stone-600">
        Отзывов гостей: {venue.reviewStats.total} ({venue.reviewStats.plus} положительных, {venue.reviewStats.minus} критических) ·{" "}
        <Link href={`/venues#v-${venue.id}`} className="font-semibold text-orange-700 underline">
          читать все
        </Link>
      </p>
      <Link href={`/venues#b-${venue.brandId}`} className="mt-2 inline-block text-xs font-semibold text-orange-700 underline">
        О меню и мнения критиков
      </Link>
    </div>
  );
}

type NearItem = {
  kind: "top" | "osm";
  id: string;
  name: string;
  meters: number;
  line: string;
  spectrum: VenueDto["spectrum"];
  venue?: VenueDto;
  osm?: OsmVenue;
};

const fmtMeters = (m: number) => (m < 1000 ? `${m} м` : `${(m / 1000).toFixed(1).replace(".", ",")} км`);

/** Лента ближайших заведений к выбранному: расстояние по прямой; у избранных видны звёзды. */
type MapTab = "near" | "theme" | "price";
const MAP_TABS: [MapTab, string][] = [
  ["near", "Рядом"],
  ["theme", "Тематика"],
  ["price", "Цена"],
];

/** Выбор вкладки: ближайшие вообще, ближайшие той же тематики или того же ценового сегмента. */
function MapTabs({ tab, onTab }: { tab: MapTab; onTab: (t: MapTab) => void }) {
  return (
    <div role="tablist" className="flex gap-1 rounded-xl bg-white p-1 shadow ring-1 ring-stone-200/80">
      {MAP_TABS.map(([id, label]) => (
        <button
          key={id}
          role="tab"
          aria-selected={tab === id}
          onClick={() => onTab(id)}
          className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-bold ${tab === id ? "bg-stone-950 text-yellow-300" : "text-stone-600 hover:bg-stone-100"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function NearbyStrip({ tab, onTab, items, onPick }: { tab: MapTab; onTab: (t: MapTab) => void; items: NearItem[]; onPick: (it: NearItem) => void }) {
  return (
    <div className="mb-2 rounded-2xl bg-white/95 px-3 pb-2 pt-2 shadow-lg ring-1 ring-stone-200/80">
      <MapTabs tab={tab} onTab={onTab} />
      <p className="mt-1.5 px-1 text-[11px] font-bold uppercase tracking-wide text-orange-700">
        {tab === "near" ? "Ближайшие заведения" : tab === "theme" ? "Ближайшие той же тематики" : "Ближайшие в том же ценовом сегменте"}
      </p>
      {items.length === 0 && <p className="px-1 py-2 text-xs text-stone-500">{tab === "near" ? "Рядом ничего не нашлось." : "Рядом таких нет, либо у этого заведения тематика не определена."}</p>}
      <div className="mt-1.5 flex gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((it) => {
          const mean = it.spectrum ? Math.round((it.spectrum.items.reduce((a, i) => a + i.stars, 0) / it.spectrum.items.length) * 10) / 10 : null;
          return (
            <button key={it.kind + it.id} onClick={() => onPick(it)} className="w-36 shrink-0 rounded-xl p-2 text-left ring-1 ring-stone-200 hover:ring-stone-950">
              <p className="truncate text-xs font-bold">{it.name}</p>
              <p className="truncate text-[11px] text-stone-500">{it.line}</p>
              <p className="mt-0.5 flex items-center justify-between text-[11px] font-semibold text-stone-600">
                <span>{fmtMeters(it.meters)}</span>
                {mean !== null && <span className="text-amber-600">★ {String(mean).replace(".", ",")}</span>}
              </p>
            </button>
          );
        })}
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
