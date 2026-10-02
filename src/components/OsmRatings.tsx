"use client";

import { chainOf, chainView } from "@/lib/venues/chains";

import ReviewList from "./ReviewList";
import { RatingSources, RatingSpectrum, StarsSummary } from "./RatingSpectrum";

/**
 * Оценки точки из общей базы: шесть площадок со ссылками, а если точка из известной
 * сети, ещё звёзды и отзывы сети (прочитаны на Отзовике или Irecommend).
 */
export default function OsmRatings({ name, address }: { name: string; address: string }) {
  const chain = chainOf(name) ? chainView(name) : null;
  return (
    <div>
      {chain?.spectrum && (
        <div className="mb-3 rounded-xl bg-orange-50 p-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-orange-700">Звёзды сети «{chain.name}»</p>
          <RatingSpectrum spectrum={chain.spectrum} />
        </div>
      )}
      <RatingSources name={name} address={address} spectrum={chain?.spectrum ?? null} />
      {chain && chain.reviews.length > 0 && (
        <details className="mt-3 rounded-xl border border-stone-200/70 p-3">
          <summary className="cursor-pointer text-sm font-semibold">Отзывы о сети «{chain.name}»: {chain.reviews.length}</summary>
          <div className="mt-3">
            <ReviewList reviews={chain.reviews} stats={chain.stats} />
          </div>
        </details>
      )}
    </div>
  );
}

/** Звёзды сети в строке списка: показываются только у точек известных сетей. */
export function ChainStars({ name }: { name: string }) {
  const chain = chainOf(name) ? chainView(name) : null;
  if (!chain?.spectrum) return null;
  return <StarsSummary spectrum={chain.spectrum} reviews={chain.reviews.length} />;
}
