"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type { DiaryWeek } from "@/lib/scan/diary";
import type { Advice } from "@/lib/venues/advice";
import { fmtTotal, gFromMg, scanTime } from "@/lib/scan/format";

const dayShort = new Intl.DateTimeFormat("ru-RU", { weekday: "short", timeZone: "UTC" });
const dayLong = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const dayMonth = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" });

const at = (date: string) => new Date(`${date}T00:00:00Z`);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const CHART_H = 120;
const CHART_MIN_MAX = 1200;

const MEAL_TONE: Record<string, string> = {
  Завтрак: "bg-yellow-100 text-orange-800",
  Обед: "bg-orange-100 text-orange-800",
  Ужин: "bg-orange-200 text-orange-900",
  Перекус: "bg-stone-100 text-stone-700",
};

export default function ScanDiaryPage() {
  const [week, setWeek] = useState<DiaryWeek | null>(null);
  const [error, setError] = useState(false);
  const [asked, setAsked] = useState<string | null>(null);
  const [advice, setAdvice] = useState<Advice | null>(null);

  const load = useCallback(async (weekStart: string | null) => {
    setError(false);
    try {
      const r = await fetch(`/api/scans/diary${weekStart ? `?week=${weekStart}` : ""}`);
      if (r.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!r.ok) throw new Error("diary");
      setWeek(((await r.json()) as { week: DiaryWeek }).week);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load(asked);
  }, [asked, load]);

  const weekStart = week?.weekStart;
  useEffect(() => {
    if (!weekStart) return;
    setAdvice(null);
    let alive = true;
    fetch(`/api/venues/advice?week=${weekStart}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { advice: Advice } | null) => alive && d && setAdvice(d.advice))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [weekStart]);

  const max = week ? Math.max(CHART_MIN_MAX, ...week.days.map((d) => d.kcal)) : CHART_MIN_MAX;

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <Link href="/scan" className="text-sm font-semibold text-orange-600">
        ← К сканеру
      </Link>
      <div className="mt-3 flex items-center gap-3">
        <h1 className="font-display text-2xl tracking-tight">Дневник</h1>
        <span className="chip bg-orange-100 text-orange-800">по неделям</span>
      </div>

      {error && (
        <p className="mt-4 text-sm text-red-600" role="alert">
          Не получилось загрузить — попробуйте ещё раз
        </p>
      )}

      {week && (
        <>
          <div className="card mt-4 flex items-center justify-between gap-2 p-2">
            <button
              className="btn-secondary h-10 w-10 !p-0"
              aria-label="Предыдущая неделя"
              onClick={() => setAsked(week.prevWeek)}
            >
              ‹
            </button>
            <div className="text-center">
              <p className="font-bold">
                {dayMonth.format(at(week.weekStart))} – {dayMonth.format(at(week.weekEnd))}
              </p>
              <p className="text-xs text-orange-700">{week.isCurrent ? "Эта неделя" : " "}</p>
            </div>
            <button
              className="btn-secondary h-10 w-10 !p-0 disabled:opacity-40"
              aria-label="Следующая неделя"
              disabled={week.nextWeek === null}
              onClick={() => week.nextWeek && setAsked(week.nextWeek)}
            >
              ›
            </button>
          </div>
          {!week.isCurrent && (
            <button className="mt-2 w-full text-center text-sm font-semibold text-orange-600" onClick={() => setAsked(null)}>
              К этой неделе
            </button>
          )}

          <div className="card mt-4 border-l-4 border-orange-400 p-4">
            <div className="flex items-end justify-between gap-1" style={{ height: CHART_H + 40 }} role="img" aria-label="Калории по дням недели">
              {week.days.map((d) => {
                const h = d.kcal > 0 ? Math.max(6, Math.round((d.kcal / max) * CHART_H)) : 3;
                const today = d.date === week.today;
                return (
                  <a key={d.date} href={`#day-${d.date}`} className="flex flex-1 flex-col items-center justify-end gap-1">
                    <span className="text-[10px] font-semibold text-orange-700">{d.kcal > 0 ? d.kcal : ""}</span>
                    <span
                      className={`w-full max-w-9 rounded-t-md ${d.kcal > 0 ? (today ? "bg-orange-600" : "bg-orange-400") : "bg-orange-100"}`}
                      style={{ height: h }}
                    />
                    <span className={`text-xs ${today ? "font-bold text-stone-950" : "text-stone-500"}`}>{cap(dayShort.format(at(d.date)))}</span>
                  </a>
                );
              })}
            </div>
          </div>

          <div className="card mt-4 bg-orange-950 p-4 text-orange-50">
            <p className="text-xs uppercase tracking-wide text-orange-300">
              Итого за неделю · {week.totals.scans} {week.totals.scans === 1 ? "скан" : "сканов"}
            </p>
            <p className="mt-1 font-bold text-orange-200">{week.totals.scans > 0 ? fmtTotal(week.totals) : "Пока пусто"}</p>
            {week.totals.scans > 0 && (
              <p className="mt-2 text-sm text-orange-300">В среднем ≈{week.avgKcal} ккал в день, когда вы сканировали</p>
            )}
          </div>

          {advice && week.totals.scans > 0 && (
            <section className="card mt-4 border-l-4 border-orange-400 p-4" aria-labelledby="diary-advice">
              <h2 id="diary-advice" className="font-display text-base tracking-tight">
                Совет помощника
              </h2>
              <p className="mt-1.5 text-sm">{advice.text}</p>
              <ul className="mt-3 space-y-1.5">
                {advice.tips.slice(0, 3).map((t) => (
                  <li key={t.title} className="rounded-lg bg-orange-50 px-3 py-2 text-sm">
                    <span className="font-semibold">{t.title}.</span> <span className="text-stone-600">{t.text}</span>
                  </li>
                ))}
              </ul>
              <Link href="/venues#assistant" className="mt-3 inline-block text-sm font-semibold text-orange-700 underline">
                Спросить помощника о заведениях Москвы →
              </Link>
            </section>
          )}

          {week.totals.scans === 0 && (
            <div className="card mt-4 p-6 text-center">
              <p className="text-sm text-stone-500">На этой неделе сканов нет. Снимите тарелку — приём пищи появится в дневнике.</p>
              <Link href="/scan" className="btn-primary mt-3 inline-flex">
                Сделать снимок
              </Link>
            </div>
          )}

          {week.days.map((d) => (
            <section key={d.date} id={`day-${d.date}`} className="mt-5 scroll-mt-20" aria-label={cap(dayLong.format(at(d.date)))}>
              <div className="flex flex-col gap-0.5">
                <h2 className={`text-xs font-bold uppercase tracking-wide ${d.date === week.today ? "text-orange-700" : "text-stone-500"}`}>
                  {cap(dayLong.format(at(d.date)))}
                  {d.date === week.today ? " · сегодня" : ""}
                </h2>
                {d.kcal > 0 && (
                  <span className="text-xs font-semibold text-stone-600">
                    ≈{d.kcal} ккал · Б {gFromMg(d.proteinMg)} · Ж {gFromMg(d.fatMg)} · У {gFromMg(d.carbsMg)}
                  </span>
                )}
              </div>
              {d.scans.length === 0 ? (
                <p className="mt-1.5 text-sm text-stone-400">—</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {d.scans.map((s) => (
                    <li key={s.id}>
                      <Link href={`/scan/${s.id}`} className="card flex items-center gap-3 p-3 hover:bg-orange-50">
                        {s.thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={`/api/scans/${s.id}/photo`} alt="" className="h-12 w-12 rounded-xl object-cover" loading="lazy" />
                        ) : (
                          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-100 text-orange-400">—</span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">
                            {s.headline ?? "Скан"}
                            {s.moreCount > 0 ? ` и ещё ${s.moreCount}` : ""}
                          </span>
                          <span className="mt-0.5 flex items-center gap-2 text-xs text-stone-500">
                            <span className={`chip !px-2 !py-0.5 ${MEAL_TONE[s.meal]}`}>{s.meal}</span>
                            {scanTime(s.createdAt)} · ≈{s.kcal} ккал
                          </span>
                        </span>
                        <span className="text-stone-400">›</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </>
      )}

      {!week && !error && <p className="mt-6 text-center text-sm text-stone-500">Загрузка…</p>}
    </div>
  );
}
