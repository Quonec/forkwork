"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { prepareScanUpload } from "@/lib/scan/compress-image";
import type { SourcePhotos } from "@/lib/venues/top25-extra";

type Photo = { id: string; url: string; caption: string; createdAt: string; author: string; mine: boolean };
type Gallery = { count: number; photos: Photo[] };

const n = (v: number) => v.toLocaleString("ru-RU");

// ── счётчики: один запрос на страницу, все метки обновляются разом ──────────
let cache: Record<string, number> | null = null;
let inflight: Promise<void> | null = null;
const subs = new Set<() => void>();

function loadCounts(force = false): Promise<void> {
  if (inflight && !force) return inflight;
  inflight = fetch("/api/venues/photos?counts=1")
    .then((r) => r.json())
    .then((d: { counts?: Record<string, number> }) => {
      cache = d.counts ?? {};
      subs.forEach((f) => f());
    })
    .catch(() => undefined)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Сколько фото добавлено у нас у каждого заведения (ключ — id заведения). */
export function usePhotoCounts(): Record<string, number> {
  const [counts, setCounts] = useState<Record<string, number>>(cache ?? {});
  useEffect(() => {
    const sync = () => setCounts({ ...(cache ?? {}) });
    subs.add(sync);
    if (cache) sync();
    else void loadCounts();
    return () => {
      subs.delete(sync);
    };
  }, []);
  return counts;
}

/** Все фото о заведении: у нас и на картах. Для сортировки. */
export const totalPhotos = (own: number, sources: SourcePhotos[]): number => own + sources.reduce((a, s) => a + s.count, 0);

/**
 * Одна строка о фото заведения: сколько добавлено в общий доступ у нас и сколько
 * гости выложили на картах. Числа не складываем в одно: фото на картах и у нас
 * могут повторяться.
 */
export function PhotoBadge({ venueKey, sources = [] }: { venueKey: string; sources?: SourcePhotos[] }) {
  const own = usePhotoCounts()[venueKey] ?? 0;
  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-stone-600">
      <span className="inline-flex items-center gap-1 font-semibold text-stone-800">
        <CameraIcon /> {own > 0 ? `${n(own)} у нас` : "у нас пока нет"}
      </span>
      {sources.map((s) => (
        <a key={s.source} href={s.url} target="_blank" rel="noopener noreferrer" className="underline decoration-stone-300 hover:text-orange-700">
          {n(s.count)} {s.source === "Яндекс Карты" ? "на Яндексе" : `на ${s.source}`}
        </a>
      ))}
    </p>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 8h3l2-2.5h6L17 8h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

/** Свёрнутая галерея заведения: строка со счётчиками и кнопка раскрыть. Галерея грузится, только когда её открыли. */
export function PhotoSection({ venueKey, name, sources = [] }: { venueKey: string; name: string; sources?: SourcePhotos[] }) {
  const [open, setOpen] = useState(false);
  const own = usePhotoCounts()[venueKey] ?? 0;
  return (
    <div className="rounded-xl border border-stone-200/70 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-orange-700">Фото заведения</p>
          <PhotoBadge venueKey={venueKey} sources={sources} />
        </div>
        <button type="button" className="btn-ghost !px-3 !py-1.5 !text-xs" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? "Свернуть" : own > 0 ? "Смотреть и добавить" : "Добавить фото"}
        </button>
      </div>
      {open && <VenuePhotos venueKey={venueKey} name={name} />}
    </div>
  );
}

/** Галерея заведения с добавлением фото: нужен вход и согласие на публикацию. */
export function VenuePhotos({ venueKey, name }: { venueKey: string; name: string }) {
  const [data, setData] = useState<Gallery | null>(null);
  const [view, setView] = useState<Photo | null>(null);
  const [caption, setCaption] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; login?: boolean } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const load = () =>
    fetch(`/api/venues/photos?venue=${encodeURIComponent(venueKey)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Gallery | null) => d && setData(d))
      .catch(() => undefined);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueKey]);

  const upload = async (file: File) => {
    setMsg(null);
    if (!consent) return setMsg({ text: "Отметьте согласие на публикацию фото." });
    setBusy(true);
    try {
      const prepared = await prepareScanUpload(file);
      if (!prepared) return setMsg({ text: "Не получилось открыть фото, выберите другое." });
      const fd = new FormData();
      fd.set("venue", venueKey);
      fd.set("consent", "1");
      fd.set("caption", caption);
      fd.set("photo", prepared.photo);
      const r = await fetch("/api/venues/photos", { method: "POST", body: fd });
      if (r.status === 401) return setMsg({ text: "Чтобы добавить фото, войдите в аккаунт.", login: true });
      const d = (await r.json().catch(() => ({}))) as Partial<Gallery> & { error?: string };
      if (!r.ok) return setMsg({ text: d.error ?? "Не получилось добавить фото." });
      setData({ count: d.count ?? 0, photos: d.photos ?? [] });
      setCaption("");
      setMsg({ text: "Фото добавлено в общий доступ." });
      void loadCounts(true);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const remove = async (p: Photo) => {
    const r = await fetch(`/api/venues/photos/${p.id}`, { method: "DELETE" });
    if (r.ok) {
      setView(null);
      await load();
      void loadCounts(true);
    }
  };

  const report = async (p: Photo) => {
    const r = await fetch(`/api/venues/photos/${p.id}/report`, { method: "POST" });
    if (r.status === 401) return setMsg({ text: "Чтобы пожаловаться, войдите в аккаунт.", login: true });
    const d = (await r.json().catch(() => ({}))) as { result?: string; error?: string };
    setView(null);
    setMsg({ text: d.error ?? (d.result === "hidden" ? "Спасибо, фото скрыто." : "Спасибо, жалоба принята.") });
    if (d.result === "hidden") {
      await load();
      void loadCounts(true);
    }
  };

  return (
    <div className="mt-3">
      {data === null ? (
        <p className="text-xs text-stone-500">Загружаю фото…</p>
      ) : data.photos.length === 0 ? (
        <p className="text-xs text-stone-500">У нас пока нет фото «{name}». Станьте первым.</p>
      ) : (
        <>
          <p className="text-xs text-stone-500">
            Добавлено у нас: {n(data.count)}
            {data.count > data.photos.length ? `, показаны ${data.photos.length} свежих` : ""}
          </p>
          <ul className="mt-2 grid grid-cols-3 gap-1.5">
            {data.photos.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => setView(p)} className="block aspect-square w-full overflow-hidden rounded-lg bg-stone-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={p.caption || `Фото ${name}`} loading="lazy" className="h-full w-full object-cover" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-3 rounded-xl bg-orange-50 p-3">
        <p className="text-xs font-bold uppercase tracking-wide text-orange-700">Добавить фото</p>
        <input className="input mt-2" placeholder="Подпись (необязательно)" maxLength={120} value={caption} onChange={(e) => setCaption(e.target.value)} aria-label="Подпись к фото" />
        <label className="mt-2 flex items-start gap-2 text-xs text-stone-700">
          <input type="checkbox" className="mt-0.5" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>
            Разрешаю опубликовать это фото на странице заведения: его увидят все, в том числе без входа. Фото сделано мной, на нём нет людей без их согласия. Удалить его можно в любой момент.
          </span>
        </label>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
        <button type="button" className="btn-primary mt-2 w-full !py-2.5" disabled={busy} onClick={() => (consent ? input.current?.click() : setMsg({ text: "Отметьте согласие на публикацию фото." }))}>
          {busy ? "Загружаю…" : "Выбрать фото"}
        </button>
        <p className="mt-1 text-[11px] text-stone-400">До 5 ваших фото у одного заведения, до 10 в сутки. Перед отправкой снимок пережимается, геометка и данные камеры удаляются.</p>
        {msg && (
          <p className="mt-2 text-xs font-semibold text-stone-800" role="status">
            {msg.text}{" "}
            {msg.login && (
              <Link href="/login" className="text-orange-700 underline">
                Войти
              </Link>
            )}
          </p>
        )}
      </div>

      {view && (
        <div className="fixed inset-0 z-[3000] flex flex-col items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" onClick={() => setView(null)}>
          <div className="max-h-full w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={view.url} alt={view.caption || `Фото ${name}`} className="max-h-[70dvh] w-full rounded-xl object-contain" />
            <p className="mt-2 text-sm text-white">
              {view.caption ? `${view.caption} · ` : ""}
              {view.author}, {new Date(view.createdAt).toLocaleDateString("ru-RU")}
            </p>
            <div className="mt-3 flex gap-2">
              {view.mine ? (
                <button type="button" className="btn flex-1 bg-red-600 !py-2.5 text-white" onClick={() => void remove(view)}>
                  Удалить моё фото
                </button>
              ) : (
                <button type="button" className="btn-secondary flex-1 !py-2.5" onClick={() => void report(view)}>
                  Пожаловаться
                </button>
              )}
              <button type="button" className="btn-primary flex-1 !py-2.5" onClick={() => setView(null)}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
