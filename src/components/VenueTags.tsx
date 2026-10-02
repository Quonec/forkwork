import { SEGMENT_BASIS_LABEL, type SegmentBasis } from "@/lib/venues/themes";

const SEGMENT_STYLE: Record<string, string> = {
  low: "bg-emerald-100 text-emerald-800",
  mid: "bg-amber-100 text-amber-900",
  high: "bg-orange-200 text-orange-900",
  top: "bg-stone-900 text-yellow-300",
};

/**
 * Тематика и ценовой сегмент заведения в виде меток. «≈» у сегмента значит оценку по виду
 * заведения, а не по среднему чеку: так отличаем догадку от данных.
 */
export default function VenueTags({
  themes,
  segment,
  themeBasis,
}: {
  themes: { id: string; label: string }[];
  segment: { id: string; label: string; basis: SegmentBasis } | null;
  themeBasis?: string;
}) {
  if (themes.length === 0 && !segment) return null;
  return (
    <p className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] font-semibold">
      {themes.map((t) => (
        <span key={t.id} className="rounded-full bg-orange-100 px-2 py-0.5 text-orange-900" title={themeBasis === "name" ? "Тематика по названию заведения" : themeBasis === "tag" ? "Тематика по тегу кухни OpenStreetMap" : "Тематика"}>
          {t.label}
          {themeBasis === "name" ? " ≈" : ""}
        </span>
      ))}
      {segment && (
        <span className={`rounded-full px-2 py-0.5 ${SEGMENT_STYLE[segment.id] ?? "bg-stone-100 text-stone-700"}`} title={SEGMENT_BASIS_LABEL[segment.basis]}>
          {segment.label}
          {segment.basis === "type" ? " ≈" : ""}
        </span>
      )}
    </p>
  );
}
