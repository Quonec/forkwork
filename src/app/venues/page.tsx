"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { Advice } from "@/lib/venues/advice";
import type { Brand } from "@/lib/venues/types";
import type { VenueDto } from "@/lib/venues/ratings";
import { RatingSources, RatingSpectrum, StarsSummary } from "@/components/RatingSpectrum";
import OsmRatings, { ChainStars } from "@/components/OsmRatings";
import ReviewList from "@/components/ReviewList";
import type { OsmVenue } from "@/lib/venues/osm";
import { CATEGORIES, categoriesOf, OSM_CATEGORIES } from "@/lib/venues/categories";
import { SEGMENTS } from "@/lib/venues/themes";
import VenueTags from "@/components/VenueTags";
import KitchenTabs from "@/components/KitchenTabs";
import { PhotoBadge, PhotoSection, totalPhotos, usePhotoCounts } from "@/components/VenuePhotos";

const TONE_DOT: Record<string, string> = { ok: "bg-emerald-500", watch: "bg-amber-500", info: "bg-orange-300" };

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

type Filters = { q: string; cat: string; minStars: number; sort: SortKey; check: string };
type SortKey = "default" | "stars" | "votes" | "reviews" | "photos" | "name";
type SectionKey = "about" | "critics" | "facts" | "cuisine" | "stars" | "reviews";
const SECTIONS: [SectionKey, string][] = [
  ["about", "Описание и меню"],
  ["facts", "Адрес и часы"],
  ["cuisine", "О кухне"],
  ["stars", "Звёзды по источникам"],
  ["reviews", "Отзывы гостей"],
  ["critics", "Что хвалят и ругают"],
];
const DEFAULT_SHOW: Record<SectionKey, boolean> = { about: true, critics: true, facts: true, cuisine: true, stars: true, reviews: true };

const meanStars = (v: VenueDto): number => (v.spectrum ? v.spectrum.items.reduce((a, i) => a + i.stars, 0) / v.spectrum.items.length : 0);
const votesOf = (v: VenueDto): number => (v.spectrum ? v.spectrum.items.reduce((a, i) => a + (i.votes ?? 0), 0) : 0);

/** Избранные заведения под фильтры: поиск по названию и адресу, кухня, нижняя граница рейтинга и порядок. */
function filterBrands(brands: Brand[], venues: VenueDto[], f: Filters, photos: Record<string, number>): Brand[] {
  const q = f.q.trim().toLowerCase().replace(/ё/g, "е");
  const placesOf = (b: Brand) => venues.filter((v) => v.brandId === b.id);
  const list = brands.filter((b) =>
    placesOf(b).some(
      (v) =>
        (!q || `${b.name} ${v.name} ${v.address}`.toLowerCase().replace(/ё/g, "е").includes(q)) &&
        (!f.cat || categoriesOf(v.cuisineKeys).includes(f.cat)) &&
        meanStars(v) >= f.minStars &&
        (!f.check || v.segment.id === f.check),
    ),
  );
  const key = (b: Brand, pick: (v: VenueDto) => number) => Math.max(0, ...placesOf(b).map(pick));
  if (f.sort === "stars") list.sort((a, b) => key(b, meanStars) - key(a, meanStars));
  if (f.sort === "votes") list.sort((a, b) => key(b, votesOf) - key(a, votesOf));
  if (f.sort === "reviews") list.sort((a, b) => key(b, (v) => v.reviewStats.total) - key(a, (v) => v.reviewStats.total));
  if (f.sort === "photos") list.sort((a, b) => key(b, (v) => totalPhotos(photos[v.id] ?? 0, v.sourcePhotos)) - key(a, (v) => totalPhotos(photos[v.id] ?? 0, v.sourcePhotos)));
  if (f.sort === "name") list.sort((a, b) => a.name.localeCompare(b.name, "ru"));
  return list;
}

export default function VenuesPage() {
  const [venues, setVenues] = useState<VenueDto[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [verifiedAt, setVerifiedAt] = useState("");
  const [advice, setAdvice] = useState<Advice | null>(null);
  const [noSession, setNoSession] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [minStars, setMinStars] = useState(0);
  const [check, setCheck] = useState("");
  const [sort, setSort] = useState<SortKey>("default");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [show, setShow] = useState<Record<SectionKey, boolean>>(DEFAULT_SHOW);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("fw_venue_view");
      if (saved) setShow({ ...DEFAULT_SHOW, ...(JSON.parse(saved) as Partial<Record<SectionKey, boolean>>) });
    } catch {
      /* без сохранённых настроек */
    }
  }, []);

  const toggleShow = (key: SectionKey) =>
    setShow((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem("fw_venue_view", JSON.stringify(next));
      } catch {
        /* настройка не сохранится, но работает */
      }
      return next;
    });
  const resetFilters = () => {
    setQ("");
    setCat("");
    setMinStars(0);
    setCheck("");
    setSort("default");
  };

  const photoCounts = usePhotoCounts();
  const shown = filterBrands(brands, venues, { q, cat, minStars, sort, check }, photoCounts);

  useEffect(() => {
    fetch("/api/venues")
      .then((r) => r.json())
      .then((d: { venues: VenueDto[]; brands: Brand[]; verifiedAt: string }) => {
        setVenues(d.venues ?? []);
        setBrands(d.brands ?? []);
        setVerifiedAt(d.verifiedAt ?? "");
      })
      .finally(() => setLoaded(true));
    fetch("/api/venues/advice").then(async (r) => {
      if (r.status === 401) return setNoSession(true);
      if (r.ok) setAdvice(((await r.json()) as { advice: Advice }).advice);
    });
  }, []);

  useEffect(() => {
    if (!loaded || !location.hash) return;
    const hash = location.hash.slice(1);
    const el = document.getElementById(hash);
    const bid = el?.closest("details")?.getAttribute("data-bid");
    if (bid) setOpen((prev) => new Set(prev).add(bid));
    el?.scrollIntoView({ block: "start" });
  }, [loaded, brands.length]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl tracking-tight">Заведения</h1>
        <span className="chip bg-orange-100 text-orange-800">Москва</span>
      </div>
      <p className="mt-2 max-w-prose text-sm text-stone-600">
        Реальные заведения со ссылками на их сайты и меню, описанием меню и мнениями критиков, если они нашлись. Меню мы не копируем: оно всегда актуальнее на сайте
        заведения.
      </p>

      <section className="card mt-5 border-l-4 border-orange-400 p-4" aria-labelledby="advice-title">
        <h2 id="advice-title" className="font-display text-lg tracking-tight">
          Помощник по вашему дневнику
        </h2>
        {noSession && (
          <p className="mt-2 text-sm text-stone-600">
            Отсканируйте пару блюд в{" "}
            <Link href="/scan" className="font-semibold text-orange-700 underline">
              сканере
            </Link>
            , и помощник разберёт вашу неделю и подскажет, на что смотреть в меню.
          </p>
        )}
        {!noSession && !advice && <p className="mt-2 text-sm text-stone-500">Разбираю дневник…</p>}
        {advice && (
          <>
            <p className="mt-2 text-sm">{advice.text}</p>
            <ul className="mt-3 space-y-1.5 text-sm text-stone-700">
              {advice.insights.map((i, n) => (
                <li key={n} className="flex gap-2">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TONE_DOT[i.tone]}`} />
                  <span>{i.text}</span>
                </li>
              ))}
            </ul>
            <h3 className="mt-4 text-xs font-bold uppercase tracking-wide text-orange-700">На что смотреть в меню</h3>
            <ul className="mt-2 space-y-2">
              {advice.tips.map((t) => (
                <li key={t.title} className="rounded-xl bg-orange-50 p-3">
                  <p className="font-semibold">{t.title}</p>
                  <p className="text-sm text-stone-600">{t.text}</p>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-stone-400">
              Ориентиры для взрослых: белки 10–35 %, жиры 20–35 %, углеводы 45–65 % калорий. Это справочная информация, а не медицинская рекомендация.
              {advice.engine === "claude" ? " Текст подготовлен ИИ по сводке вашего дневника." : ""}
            </p>
          </>
        )}
      </section>

      <VenueAssistant />

      <OsmSearch />

      <h2 className="font-display mt-8 text-lg tracking-tight">Избранные заведения: Пушкинъ и топ-25 Москвы</h2>
      <p className="mt-1 text-xs text-stone-500">
        Топ-25 взят из подборки РБК Вино (обновлена 8 июля 2025). Оценки и отзывы прочитаны на 2ГИС и Яндекс Картах 2026-10-02.
      </p>

      <section className="card mt-3 p-4" aria-label="Фильтры избранных заведений">
        <div className="grid gap-2 sm:grid-cols-2">
          <input className="input" placeholder="Название или адрес" value={q} maxLength={60} onChange={(e) => setQ(e.target.value)} aria-label="Поиск по избранным" />
          <select className="input" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Кухня">
            <option value="">Любая кухня</option>
            {CATEGORIES.filter((c) => venues.some((v) => categoriesOf(v.cuisineKeys).includes(c.id))).map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <select className="input" value={minStars} onChange={(e) => setMinStars(Number(e.target.value))} aria-label="Минимальный рейтинг">
            <option value={0}>Любой рейтинг</option>
            <option value={4.5}>От 4,5 звезды</option>
            <option value={4.7}>От 4,7 звезды</option>
            <option value={4.9}>От 4,9 звезды</option>
          </select>
          <select className="input" value={check} onChange={(e) => setCheck(e.target.value)} aria-label="Ценовой сегмент">
            <option value="">Любой ценовой сегмент</option>
            {SEGMENTS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label} ({b.range})
              </option>
            ))}
          </select>
          <select className="input" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Порядок">
            <option value="default">Как в подборке</option>
            <option value="stars">Сначала с высоким рейтингом</option>
            <option value="votes">Сначала с большим числом оценок</option>
            <option value="reviews">Сначала с большим числом отзывов</option>
            <option value="photos">Сначала с большим числом фото</option>
            <option value="name">По алфавиту</option>
          </select>
        </div>

        <p className="mt-4 text-xs font-bold uppercase tracking-wide text-orange-700">Что показывать в карточке</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {SECTIONS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={show[key]}
              onClick={() => toggleShow(key)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${show[key] ? "border-orange-400 bg-orange-100 text-orange-900" : "border-stone-200 bg-white text-stone-500"}`}
            >
              {show[key] ? "✓ " : ""}
              {label}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-stone-500">
            Показано {shown.length} из {brands.length}
          </span>
          <button type="button" className="btn-ghost !px-3 !py-1 !text-xs" onClick={() => setOpen(new Set(shown.map((b) => b.id)))}>
            Раскрыть все
          </button>
          <button type="button" className="btn-ghost !px-3 !py-1 !text-xs" onClick={() => setOpen(new Set())}>
            Свернуть все
          </button>
          {(q || cat || check || minStars > 0 || sort !== "default") && (
            <button type="button" className="btn-ghost !px-3 !py-1 !text-xs" onClick={resetFilters}>
              Сбросить фильтры
            </button>
          )}
        </div>
      </section>

      <div className="mt-3 space-y-3">
        {shown.map((b) => {
          const places = venues.filter((v) => v.brandId === b.id);
          const main = places[0];
          return (
            <details
              key={b.id}
              id={`b-${b.id}`}
              data-bid={b.id}
              open={open.has(b.id)}
              onToggle={(e) => {
                const isOpen = e.currentTarget.open;
                setOpen((prev) => {
                  if (prev.has(b.id) === isOpen) return prev;
                  const next = new Set(prev);
                  if (isOpen) next.add(b.id);
                  else next.delete(b.id);
                  return next;
                });
              }}
              className="card scroll-mt-20 p-4"
            >
              <summary className="flex cursor-pointer list-none items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-500 text-stone-950">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="6" />
                    <circle cx="12" cy="12" r="2.5" />
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-display text-lg leading-tight tracking-tight">{b.name}</h3>
                  <p className="text-xs text-stone-500">
                    {b.cuisine}
                    {main ? ` · ${main.address}` : ""}
                  </p>
                  {main && <StarsSummary spectrum={main.spectrum} reviews={main.reviewStats.total} />}
                  {main && <VenueTags themes={main.themes} segment={main.segment} themeBasis="tag" />}
                  {main && <PhotoBadge venueKey={main.id} sources={main.sourcePhotos} />}
                </div>
                <span className="mt-1 shrink-0 text-xs font-semibold text-orange-700">{open.has(b.id) ? "Свернуть" : "Подробнее"}</span>
              </summary>

              {open.has(b.id) && (
              <>

              {show.about && (
                <>
                  <h4 className="mt-4 text-xs font-bold uppercase tracking-wide text-orange-700">О заведении</h4>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-stone-700">
                    {b.info.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>

                  <h4 className="mt-4 text-xs font-bold uppercase tracking-wide text-orange-700">О меню</h4>
                  <p className="mt-1 text-sm text-stone-700">{b.menu.summary}</p>

                  <h4 className="mt-4 text-xs font-bold uppercase tracking-wide text-orange-700">Меню тезисами</h4>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-stone-700">
                    {b.menuTheses.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </>
              )}

              {show.critics && (
                <>
                  {b.reviews.length > 0 && (
                    <>
                      <h4 className="mt-4 text-xs font-bold uppercase tracking-wide text-orange-700">Что пишут критики</h4>
                      <ul className="mt-2 space-y-3">
                        {b.reviews.map((r) => (
                          <li key={r.url} className="rounded-xl bg-orange-50 p-3">
                            <p className="text-xs text-stone-500">
                              {r.outlet}
                              {r.author ? `, ${r.author}` : ""} · {r.date}
                            </p>
                            <p className="mt-0.5 text-xs text-stone-500">О чём материал: {r.about}</p>
                            <p className="mt-1.5 text-sm">{r.verdict}</p>
                            {r.quote && <blockquote className="mt-2 border-l-2 border-orange-300 pl-3 text-sm italic text-stone-700">«{r.quote}»</blockquote>}
                            <a href={r.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs font-semibold text-orange-700 underline">
                              Читать у источника · {hostOf(r.url)}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {b.guestSources.length > 0 && (
                    <>
                      <h4 className="mt-4 text-xs font-bold uppercase tracking-wide text-orange-700">Что хвалят и ругают, по источникам</h4>
                      <ul className="mt-2 space-y-3">
                        {b.guestSources.map((g) => (
                          <li key={g.url} className="rounded-xl border border-stone-200/70 p-3 text-sm">
                            <p className="text-xs text-stone-500">
                              <a href={g.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-orange-700 underline">
                                {g.source}
                              </a>{" "}
                              · {g.period}
                              {g.rating ? ` · ${g.rating}` : ""}
                            </p>
                            {g.positives.length > 0 && (
                              <p className="mt-1.5">
                                <span className="font-semibold text-emerald-700">Хвалят: </span>
                                {g.positives.join("; ")}
                              </p>
                            )}
                            {g.negatives.length > 0 && (
                              <p className="mt-1">
                                <span className="font-semibold text-red-700">Ругают: </span>
                                {g.negatives.join("; ")}
                              </p>
                            )}
                            {g.note && <p className="mt-1 text-xs text-stone-500">{g.note}</p>}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {b.guestReviewLinks && (
                    <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                      {b.guestReviewLinks.map((l) => (
                        <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-orange-700 underline">
                          {l.title}
                        </a>
                      ))}
                    </p>
                  )}
                </>
              )}

              <ul className="mt-4 space-y-3">
                {places.map((v) => (
                  <li key={v.id} id={`v-${v.id}`} className="scroll-mt-20 rounded-xl border border-stone-200/70 p-3">
                    {places.length > 1 && <p className="text-sm font-semibold">{v.name}</p>}
                    {show.facts && (
                      <ul className="list-disc space-y-0.5 pl-5 text-sm text-stone-700">
                        {v.facts.map((f) => (
                          <li key={f}>{f}</li>
                        ))}
                      </ul>
                    )}
                    {show.cuisine && <KitchenTabs cuisine={b.cuisine} facts={v.cuisineFacts} chefs={v.chefs} />}
                    {show.stars && (
                      <>
                        {v.spectrum && (
                          <div className="mt-3 rounded-xl bg-orange-50 p-3">
                            <h5 className="mb-2 text-xs font-bold uppercase tracking-wide text-orange-700">Звёзды по источникам</h5>
                            <RatingSpectrum spectrum={v.spectrum} />
                          </div>
                        )}
                        <div className="mt-3">
                          <RatingSources name={v.name} address={v.address} spectrum={v.spectrum} />
                        </div>
                      </>
                    )}
                    <div className="mt-3">
                      <PhotoSection venueKey={v.id} name={v.name} sources={v.sourcePhotos} />
                    </div>
                    {show.reviews && v.reviews.length > 0 && (
                      <div className="mt-3">
                        <ReviewList reviews={v.reviews} stats={v.reviewStats} />
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <a href={v.menuUrl} target="_blank" rel="noopener noreferrer" className="btn-primary !py-2">
                        Меню
                      </a>
                      {v.website && (
                        <a href={v.website} target="_blank" rel="noopener noreferrer" className="btn-secondary !py-2">
                          Сайт · {hostOf(v.website)}
                        </a>
                      )}
                      <Link href={`/map?venue=${v.id}`} className="btn-ghost !py-2">
                        На карте
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
              {places[0]?.locationsUrl && (
                <p className="mt-2 text-xs text-stone-500">
                  Это сеть.{" "}
                  <a href={places[0].locationsUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-orange-700 underline">
                    Все адреса на сайте
                  </a>
                </p>
              )}
              </>
              )}
            </details>
          );
        })}
        {loaded && brands.length === 0 && <p className="text-sm text-stone-500">Заведения не загрузились.</p>}
        {loaded && brands.length > 0 && shown.length === 0 && <p className="text-sm text-stone-500">Под такие фильтры ничего не подошло. Попробуйте сбросить их.</p>}
      </div>
      <p className="mt-4 text-xs text-stone-400">
        Данные собраны вручную с официальных сайтов и из открытых публикаций{verifiedAt ? ` (проверено ${verifiedAt})` : ""}; координаты по адресу из OpenStreetMap. Мнения критиков
        приведены по источникам, оценки принадлежат их авторам. Часы работы и меню могут измениться, актуальное всегда на сайте.
      </p>
    </div>
  );
}

const KIND_OPTIONS: [string, string][] = [
  ["", "Все виды"],
  ["restaurant", "Рестораны"],
  ["cafe", "Кафе"],
  ["fast_food", "Фастфуд"],
  ["bar", "Бары"],
  ["pub", "Пабы"],
  ["food_court", "Фудкорты"],
];
const PAGE = 30;
const searchLink = (v: OsmVenue) => `https://yandex.ru/search/?text=${encodeURIComponent(`${v.name} ${v.address} Москва меню`.trim())}`;

function OsmSearch() {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [site, setSite] = useState(false);
  const [cat, setCat] = useState("");
  const [segment, setSegment] = useState("");
  const [exact, setExact] = useState(false);
  const [rows, setRows] = useState<OsmVenue[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [stats, setStats] = useState<{ total: number; withWebsite: number; withMenuUrl: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/venues/osm?stats=1")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    const t = setTimeout(() => {
      setBusy(true);
      const p = new URLSearchParams({ limit: String(PAGE), offset: "0" });
      if (q.trim()) p.set("q", q.trim());
      if (kind) p.set("kind", kind);
      if (site) p.set("site", "1");
      if (cat) p.set("cat", cat);
      if (segment) p.set("segment", segment);
      if (exact) p.set("exact", "1");
      fetch(`/api/venues/osm?${p}`, { signal: ac.signal })
        .then((r) => r.json())
        .then((d: { total: number; venues: OsmVenue[] }) => {
          setRows(d.venues);
          setTotal(d.total);
        })
        .catch(() => undefined)
        .finally(() => setBusy(false));
    }, 250);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [q, kind, site, cat, segment, exact]);

  const more = async () => {
    const p = new URLSearchParams({ limit: String(PAGE), offset: String(rows.length) });
    if (q.trim()) p.set("q", q.trim());
    if (kind) p.set("kind", kind);
    if (site) p.set("site", "1");
    if (cat) p.set("cat", cat);
    if (segment) p.set("segment", segment);
    if (exact) p.set("exact", "1");
    const d = (await (await fetch(`/api/venues/osm?${p}`)).json()) as { venues: OsmVenue[] };
    setRows((r) => [...r, ...d.venues]);
  };

  return (
    <section className="card mt-6 p-4" aria-labelledby="osm-title">
      <h2 id="osm-title" className="font-display text-lg tracking-tight">
        Все заведения Москвы
      </h2>
      <p className="mt-1 text-sm text-stone-600">
        {stats && stats.total > 0
          ? `В базе ${stats.total.toLocaleString("ru-RU")} заведений из OpenStreetMap; у ${stats.withWebsite.toLocaleString("ru-RU")} указан сайт. `
          : "База заведений пока пуста: запустите импорт (npm run venues:import). "}
        Меню у них на собственных сайтах, мы даём ссылку, если она есть на карте.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
        <input
          id="osm-q"
          className="input"
          placeholder="Название заведения"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Название заведения"
        />
        <select id="osm-kind" className="input sm:w-44" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Вид заведения">
          {KIND_OPTIONS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <select id="osm-cat" className="input" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Тематика">
          <option value="">Любая тематика</option>
          {OSM_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <select id="osm-segment" className="input" value={segment} onChange={(e) => setSegment(e.target.value)} aria-label="Ценовой сегмент">
          <option value="">Любой ценовой сегмент</option>
          {SEGMENTS.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label} ({b.range})
            </option>
          ))}
        </select>
      </div>
      <p className="mt-1 text-[11px] text-stone-400">
        Тематика определена у большинства заведений: по тегу кухни OpenStreetMap, а где его нет, по названию (метка «≈»); у остальных не определена. Ценовой сегмент по среднему чеку известен только у сетей из нашего набора и избранных заведений (по 2ГИС), у остальных это оценка по виду заведения: фастфуд и кофе навынос — эконом, прочие — средний (метка «≈»). Это ориентир, а не данные.
      </p>
      <label className="mt-2 flex items-center gap-2 text-sm">
        <input id="osm-exact" type="checkbox" checked={exact} onChange={(e) => setExact(e.target.checked)} />
        <span>Сегмент только по настоящему чеку или данным источника (без оценки по виду)</span>
      </label>
      <label className="mt-2 flex items-center gap-2 text-sm">
        <input id="osm-site" type="checkbox" checked={site} onChange={(e) => setSite(e.target.checked)} />
        <span>Только с сайтом или ссылкой на меню</span>
      </label>
      {total !== null && (
        <p className="mt-3 text-xs text-stone-500">
          {busy ? "Ищу…" : `Найдено: ${total.toLocaleString("ru-RU")}`}
        </p>
      )}
      <ul className="mt-2 space-y-2">
        {rows.map((v) => (
          <li key={v.id} className="rounded-xl border border-stone-200/70 p-3">
            <p className="font-semibold">{v.name}</p>
            <VenueTags themes={v.themes} segment={v.segment} themeBasis={v.themeBasis} />
            <ChainStars name={v.name} />
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-stone-600">
              {v.facts.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <KitchenTabs facts={v.cuisineFacts} compact />
            <div className="mt-3">
              <OsmRatings name={v.name} address={v.address} />
            <div className="mt-3">
              <PhotoSection venueKey={v.id} name={v.name} />
            </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {v.menuUrl && (
                <a href={v.menuUrl} target="_blank" rel="noopener noreferrer" className="btn-primary !px-3 !py-1.5 !text-xs">
                  Меню на сайте
                </a>
              )}
              {v.website && (
                <a href={v.website} target="_blank" rel="noopener noreferrer" className="btn-secondary !px-3 !py-1.5 !text-xs">
                  Сайт · {hostOf(v.website)}
                </a>
              )}
              <a href={searchLink(v)} target="_blank" rel="noopener noreferrer" className="btn-ghost !px-3 !py-1.5 !text-xs">
                Найти меню
              </a>
              <Link href={`/map?osm=${v.id}`} className="btn-ghost !px-3 !py-1.5 !text-xs">
                На карте
              </Link>
            </div>
          </li>
        ))}
      </ul>
      {total !== null && rows.length < total && (
        <button className="btn-secondary mt-3 w-full" onClick={more}>
          Показать ещё
        </button>
      )}
      <p className="mt-3 text-[11px] text-stone-400">
        Данные © участники OpenStreetMap (лицензия ODbL). Факты (вид, метро рядом, число одноимённых, адрес, часы, сайт) получены из этих данных и координат; звёзд у них нет: рейтинги с карт для 12 тысяч заведений мы не собираем, по ссылкам их можно открыть. Мы ничего не дописываем.
      </p>
    </section>
  );
}

type ChatMessage = { role: "user" | "assistant"; text: string; sources?: { title: string; url: string }[] };

const SUGGESTIONS = ["Какие отзывы о White Rabbit?", "Что в меню Selfie подходит под мой дневник?", "Расскажи про «Пушкинъ»", "Посоветуй, что выбрать по моему дневнику"];

function VenueAssistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [needLogin, setNeedLogin] = useState(false);

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    setMessages((m) => [...m, { role: "user", text: q }]);
    setText("");
    setBusy(true);
    try {
      const r = await fetch("/api/venues/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q }) });
      if (r.status === 401) {
        setNeedLogin(true);
        setMessages((m) => [...m, { role: "assistant", text: "Чтобы я учитывал ваш дневник, сначала отсканируйте блюдо в сканере (это создаёт гостевой доступ) или войдите." }]);
        return;
      }
      const d = (await r.json()) as { answer?: string; sources?: { title: string; url: string }[]; error?: string };
      setMessages((m) => [...m, { role: "assistant", text: d.answer ?? d.error ?? "Не получилось ответить", sources: d.sources }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: "Не получилось ответить, попробуйте ещё раз." }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="assistant" className="card mt-6 scroll-mt-20 border-l-4 border-orange-400 p-4" aria-labelledby="assistant-title">
      <h2 id="assistant-title" className="font-display text-lg tracking-tight">
        Спросить помощника
      </h2>
      <p className="mt-1 text-sm text-stone-600">
        Отвечает по описанию заведений, меню тезисами, мнениям критиков и отзывам гостей и учитывает ваш недельный дневник. Чего нет в данных, он так и скажет.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button key={s} className="chip bg-orange-50 text-orange-800 ring-1 ring-orange-200 hover:bg-orange-100" onClick={() => void ask(s)} disabled={busy}>
            {s}
          </button>
        ))}
      </div>
      {messages.length > 0 && (
        <ul className="mt-4 space-y-3" aria-live="polite">
          {messages.map((m, i) => (
            <li key={i} className={m.role === "user" ? "ml-8 rounded-xl bg-stone-100 p-3 text-sm" : "rounded-xl bg-orange-50 p-3 text-sm"}>
              <p className="whitespace-pre-wrap">{m.text}</p>
              {m.sources && m.sources.length > 0 && (
                <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  {m.sources.map((s) => (
                    <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-orange-700 underline">
                      {s.title}
                    </a>
                  ))}
                </p>
              )}
            </li>
          ))}
          {busy && <li className="text-sm text-stone-500">Думаю…</li>}
        </ul>
      )}
      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(text);
        }}
      >
        <input id="assistant-q" className="input" placeholder="Например: какие отзывы о «Белуге»?" value={text} maxLength={400} onChange={(e) => setText(e.target.value)} aria-label="Вопрос помощнику" />
        <button className="btn-primary shrink-0 disabled:opacity-50" disabled={busy || text.trim().length < 2}>
          Спросить
        </button>
      </form>
      {needLogin && (
        <p className="mt-2 text-xs text-stone-500">
          <Link href="/scan" className="font-semibold text-orange-700 underline">
            Открыть сканер
          </Link>{" "}
          или{" "}
          <Link href="/login?next=/venues" className="font-semibold text-orange-700 underline">
            войти
          </Link>
          .
        </p>
      )}
    </section>
  );
}
