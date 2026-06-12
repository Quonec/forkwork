import Link from "next/link";
import type { ChefCard } from "@/lib/types";
import { Stars, LiveBadge, EmojiCover } from "./ui";
import { PRICE_LEVELS, plural } from "@/lib/format";

export function ChefCardView({ chef }: { chef: ChefCard }) {
  return (
    <Link href={`/chefs/${chef.id}`} className="card group block overflow-hidden transition-shadow hover:shadow-md">
      <div className="relative">
        <EmojiCover emoji={chef.avatar} id={chef.id} className="h-28 w-full" textSize="text-6xl" />
        <div className="absolute left-3 top-3 flex gap-1.5">
          {chef.liveStreamId && <LiveBadge small />}
          {chef.available ? (
            <span className="chip bg-emerald-600/90 px-2 py-0.5 text-[10px] text-white">Принимает заказы</span>
          ) : (
            <span className="chip bg-stone-500/90 px-2 py-0.5 text-[10px] text-white">Не доступен</span>
          )}
        </div>
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-bold leading-tight group-hover:text-orange-600">{chef.name}</h3>
          <span className="shrink-0 text-xs font-bold text-stone-400">{PRICE_LEVELS[chef.priceLevel]}</span>
        </div>
        <p className="mt-0.5 text-xs text-stone-500">
          {chef.cuisineEmoji} {chef.cuisineName} · {chef.specialization}
        </p>
        <div className="mt-2.5 flex items-center justify-between">
          <Stars rating={chef.rating} size="text-xs" />
          <span className="text-[11px] text-stone-400">
            {chef.reviewsCount} {plural(chef.reviewsCount, "отзыв", "отзыва", "отзывов")}
          </span>
        </div>
      </div>
    </Link>
  );
}
