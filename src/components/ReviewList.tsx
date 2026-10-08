"use client";

import { useState } from "react";

import type { ReviewStats, VenueReview } from "@/lib/venues/reviews";

const TONE: Record<string, { dot: string; label: string }> = {
  "+": { dot: "bg-emerald-500", label: "положительный" },
  "±": { dot: "bg-amber-500", label: "смешанный" },
  "-": { dot: "bg-red-500", label: "критический" },
};

/** Отзывы гостей по источникам с полосой тональности. Тональность: по звёздам источника, где они есть, иначе по смыслу текста. */
export default function ReviewList({ reviews, stats, initial = 5 }: { reviews: VenueReview[]; stats: ReviewStats; initial?: number }) {
  const [all, setAll] = useState(false);
  if (reviews.length === 0) return null;
  const shown = all ? reviews : reviews.slice(0, initial);
  const pct = (n: number) => `${(n / stats.total) * 100}%`;
  return (
    <div>
      <p className="text-sm font-semibold">
        Отзывы гостей: {stats.total} <span className="font-normal text-stone-500">· {stats.sources} {stats.sources === 1 ? "источник" : "источника"}</span>
      </p>
      <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-stone-100" role="img" aria-label={`Положительных ${stats.plus}, смешанных ${stats.mixed}, критических ${stats.minus}`}>
        <div className="bg-emerald-500" style={{ width: pct(stats.plus) }} />
        <div className="bg-amber-400" style={{ width: pct(stats.mixed) }} />
        <div className="bg-red-500" style={{ width: pct(stats.minus) }} />
      </div>
      <p className="mt-1 text-[11px] text-stone-500">
        <span className="font-semibold text-emerald-700">{stats.plus} положительных</span> · <span className="font-semibold text-amber-700">{stats.mixed} смешанных</span> ·{" "}
        <span className="font-semibold text-red-700">{stats.minus} критических</span>
      </p>
      <ul className="mt-3 space-y-2">
        {shown.map((r, i) => (
          <li key={`${r.url}-${r.author}-${i}`} className="rounded-lg border border-stone-200/70 p-2.5 text-sm">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-stone-500">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${TONE[r.tone]!.dot}`} title={TONE[r.tone]!.label} />
              <span className="font-semibold text-stone-800">{r.author}</span>
              {r.stars ? <span className="text-orange-600">{"★".repeat(r.stars)}<span className="text-stone-300">{"★".repeat(5 - r.stars)}</span></span> : null}
              {r.date ? <span>{r.date}</span> : null}
              <a href={r.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-orange-700 underline">
                {r.source}
              </a>
              {r.chain ? <span className="rounded bg-stone-100 px-1.5 text-[10px]">по сети</span> : null}
              {r.lang === "en" ? <span className="rounded bg-stone-100 px-1.5 text-[10px]">на английском</span> : null}
            </div>
            <p className="mt-1">«{r.text}»</p>
          </li>
        ))}
      </ul>
      {reviews.length > initial && (
        <button className="btn-secondary mt-2 w-full !py-2 !text-xs" onClick={() => setAll((v) => !v)}>
          {all ? "Свернуть" : `Показать все ${reviews.length}`}
        </button>
      )}
      <p className="mt-2 text-[11px] text-stone-400">
        Фрагменты отзывов приведены по страницам источников (прочитано 2026-10-01), авторы и даты как на странице. У Irecommend показан заголовок отзыва. Тональность по звёздам источника, а где их нет, по смыслу текста.
      </p>
    </div>
  );
}
