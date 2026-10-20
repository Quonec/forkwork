"use client";

import { useState } from "react";
import { fmtFC, timeAgo } from "@/lib/format";
import { mealLabel, type Meal } from "@/lib/meal";

export type ListingView = {
  id: string;
  title: string;
  description: string;
  price: number;
  meal: Meal;
  photoUrl: string;
  videoUrl: string | null;
  seller: string;
  createdAt: string;
  mine: boolean;
};

/** Плитка «продаю блюдо»: фото, по нажатию видео, цена, приём пищи и продавец. */
export default function ListingCard({ l, onDelete }: { l: ListingView; onDelete?: (id: string) => void }) {
  const [video, setVideo] = useState(false);
  return (
    <article className="card overflow-hidden">
      <div className="relative aspect-[4/3] bg-stone-100">
        {video && l.videoUrl ? (
          <video src={l.videoUrl} poster={l.photoUrl} controls autoPlay playsInline className="h-full w-full object-cover" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={l.photoUrl} alt={l.title} loading="lazy" className="h-full w-full object-cover" />
        )}
        <span className="chip absolute left-2 top-2 bg-white/90 text-stone-800">{mealLabel(l.meal)}</span>
        {l.videoUrl && !video && (
          <button
            type="button"
            onClick={() => setVideo(true)}
            className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-stone-950/80 px-3 py-1.5 text-xs font-bold text-white"
            aria-label="Смотреть видео"
          >
            ▶ Видео
          </button>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-bold leading-snug">{l.title}</h3>
          <p className="shrink-0 font-extrabold text-orange-600">{fmtFC(l.price)}</p>
        </div>
        {l.description && <p className="mt-1 line-clamp-3 text-xs text-stone-600">{l.description}</p>}
        <p className="mt-2 text-[11px] text-stone-400">
          {l.seller} · {timeAgo(l.createdAt)}
        </p>
        {l.mine && onDelete && (
          <button type="button" onClick={() => confirm("Снять объявление?") && onDelete(l.id)} className="btn-danger mt-3 !py-1.5 text-xs">
            Снять с продажи
          </button>
        )}
      </div>
    </article>
  );
}
