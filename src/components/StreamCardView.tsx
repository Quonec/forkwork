import Link from "next/link";
import type { StreamInfo } from "@/lib/types";
import { LiveBadge, EmojiCover } from "./ui";
import { fmtDateTime } from "@/lib/format";

export function StreamCardView({ stream }: { stream: StreamInfo }) {
  return (
    <Link href={`/streams/${stream.id}`} className="card group block overflow-hidden transition-shadow hover:shadow-md">
      <div className="relative">
        <EmojiCover emoji={stream.status === "live" ? "🔥" : stream.status === "scheduled" ? "📅" : "🎬"} id={stream.id} className="h-32 w-full" textSize="text-5xl" />
        <div className="absolute left-3 top-3">
          {stream.status === "live" ? (
            <LiveBadge />
          ) : stream.status === "scheduled" ? (
            <span className="chip bg-amber-500 text-white">Скоро</span>
          ) : (
            <span className="chip bg-stone-600 text-white">Запись завершена</span>
          )}
        </div>
        {stream.status === "live" && (
          <span className="absolute right-3 top-3 chip bg-black/60 text-white">👁 {stream.viewers}</span>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-bold leading-snug group-hover:text-orange-600">{stream.title}</h3>
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-stone-500">
          <span>{stream.chefAvatar}</span> {stream.chefName} · {stream.cuisineName}
        </p>
        {stream.status === "scheduled" && stream.scheduledAt && (
          <p className="mt-1 text-xs font-semibold text-amber-600">Начало: {fmtDateTime(stream.scheduledAt)}</p>
        )}
      </div>
    </Link>
  );
}
