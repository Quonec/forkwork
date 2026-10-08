import { MATCH, ratingSources, sourceColor } from "@/lib/venues/sources";
import type { Spectrum } from "@/lib/venues/ratings";

const fmt = (n: number) => String(n).replace(".", ",");
const plural = (n: number) => (n === 1 ? "источник" : n < 5 ? "источника" : "источников");

/** Пять звёзд, закрашенных на долю оценки (4,6 → четыре с половиной). */
export function Stars({ value, color }: { value: number; color: string }) {
  return (
    <span className="relative inline-block whitespace-nowrap text-base leading-none" aria-hidden="true">
      <span className="text-stone-300">★★★★★</span>
      <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${(value / 5) * 100}%`, color }}>
        ★★★★★
      </span>
    </span>
  );
}

/** Визуализация звёзд по источникам: у каждого источника звёзды и полоса по числу оценок (логарифмическая шкала). */
export function SourceStars({ spectrum }: { spectrum: Spectrum }) {
  const maxVotes = Math.max(1, ...spectrum.items.map((i) => i.votes ?? 0));
  const barWidth = (votes: number | null) => (votes ? Math.max(8, (Math.log10(votes + 1) / Math.log10(maxVotes + 1)) * 100) : 0);
  return (
    <ul className="space-y-3" aria-label="Звёзды по источникам">
      {[...spectrum.items].sort((a, b) => b.stars - a.stars).map((i) => (
        <li key={i.source + i.url}>
          <div className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2 text-sm">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: sourceColor(i.source) }} />
              <a href={i.url} target="_blank" rel="noopener noreferrer" className="truncate font-semibold text-orange-700 underline">
                {i.source}
              </a>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <Stars value={i.stars} color={sourceColor(i.source)} />
              <span className="w-8 text-right text-sm font-bold tabular-nums">{fmt(i.stars)}</span>
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div className="h-1.5 flex-1 rounded-full bg-stone-100">
              {i.votes ? <div className="h-full rounded-full" style={{ width: `${barWidth(i.votes)}%`, background: sourceColor(i.source) }} /> : null}
            </div>
            <span className="w-44 shrink-0 text-right text-[11px] leading-tight text-stone-500">
              {i.kind === "критик" ? "оценка критика" : i.count ?? ""}
              {" · "}
              {i.period}
              {i.raw.endsWith("из 10") ? ` · ${i.raw}` : ""}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Шкала от 1 до 5 звёзд с точкой на каждый источник: видно разброс, а не среднюю. */
export function RatingSpectrum({ spectrum, compact = false }: { spectrum: Spectrum; compact?: boolean }) {
  const range = spectrum.min === spectrum.max ? `${fmt(spectrum.min)}` : `${fmt(spectrum.min)}–${fmt(spectrum.max)}`;
  return (
    <div>
      <p className="text-sm font-semibold">
        <span className="text-orange-600" aria-hidden="true">
          ★
        </span>{" "}
        {range} из 5 <span className="font-normal text-stone-500">· {spectrum.count} {plural(spectrum.count)}</span>
      </p>
      <div className="relative mt-2 h-5" role="img" aria-label={`Оценки от ${fmt(spectrum.min)} до ${fmt(spectrum.max)} из 5 по ${spectrum.count} источникам`}>
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-orange-100" />
        {spectrum.min !== spectrum.max && (
          <div
            className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-orange-300"
            style={{ left: `${((spectrum.min - 1) / 4) * 100}%`, width: `${((spectrum.max - spectrum.min) / 4) * 100}%` }}
          />
        )}
        {spectrum.items.map((i) => (
          <span
            key={i.source + i.url}
            title={`${i.source}: ${i.raw}`}
            className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white"
            style={{ left: `${((i.stars - 1) / 4) * 100}%`, background: sourceColor(i.source) }}
          />
        ))}
      </div>
      <div className="mt-0.5 flex justify-between text-[10px] text-stone-400" aria-hidden="true">
        <span>1</span>
        <span>2</span>
        <span>3</span>
        <span>4</span>
        <span>5</span>
      </div>
      {!compact && (
        <>
          <div className="mt-3">
            <SourceStars spectrum={spectrum} />
          </div>
          <p className="mt-2 text-[11px] text-stone-400">
            Звёзды и точки закрашены цветом источника, доля закраски равна оценке. Полоса под звёздами показывает число оценок источника (логарифмическая
            шкала). Оценки получены разными аудиториями, поэтому показан разброс, а не среднее.
          </p>
        </>
      )}
    </div>
  );
}

/** Шесть площадок оценок плюс другие источники, где мы прочитали оценку: звёзды показаны там, где они прочитаны, на остальных ссылка на поиск заведения. */
export function RatingSources({ name, address, spectrum }: { name: string; address: string; spectrum: Spectrum | null }) {
  const list = ratingSources(name, address);
  const known = (id: string) => spectrum?.items.find((i) => MATCH[id]!.some((m) => i.source.startsWith(m)));
  const matched = new Set(list.map((s) => known(s.id)).filter(Boolean));
  const extra = (spectrum?.items ?? []).filter((i) => !matched.has(i));
  const chips = [
    ...list.map((s) => ({ key: s.id, source: s.source, url: known(s.id)?.url ?? s.url, stars: known(s.id)?.stars ?? null })),
    ...extra.map((i) => ({ key: i.source + i.url, source: i.source.split(" (")[0]!, url: i.url, stars: i.stars })),
  ];
  const n = chips.filter((c) => c.stars !== null).length;
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-orange-700">
        Оценки на {chips.length} {chips.length < 5 ? "источника" : "источниках"} <span className="font-normal normal-case text-stone-500">· звёзды прочитаны на {n}, на остальных по ссылке</span>
      </p>
      <ul className="mt-2 grid grid-cols-2 gap-2">
        {chips.map((c) => (
          <li key={c.key}>
            <a
              href={c.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-lg border bg-white px-2.5 py-2 text-xs"
              style={{ borderColor: c.stars !== null ? sourceColor(c.source) : "#e7e5e4" }}
            >
              <span className="block font-semibold leading-tight text-stone-800">{c.source}</span>
              <span className="mt-1 flex items-center gap-2">
                {c.stars !== null ? (
                  <>
                    <Stars value={c.stars} color={sourceColor(c.source)} />
                    <span className="font-bold tabular-nums">{fmt(c.stars)}</span>
                  </>
                ) : (
                  <>
                    <Stars value={0} color="#a8a29e" />
                    <span className="text-stone-500 underline">смотреть</span>
                  </>
                )}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Средняя оценка по источникам и по строке звёзд на каждый источник: видно и итог, и разброс, не раскрывая карточку. */
export function StarsSummary({ spectrum, reviews }: { spectrum: Spectrum | null; reviews?: number }) {
  if (!spectrum) return null;
  const mean = Math.round((spectrum.items.reduce((a, i) => a + i.stars, 0) / spectrum.items.length) * 10) / 10;
  return (
    <div className="mt-1.5">
      <p className="flex flex-wrap items-center gap-x-2 text-sm">
        <Stars value={mean} color="#f59e0b" />
        <span className="font-bold tabular-nums">{fmt(mean)}</span>
        <span className="text-xs text-stone-500">
          {spectrum.count} {plural(spectrum.count)}
          {reviews ? ` · ${reviews} отзывов` : ""}
        </span>
      </p>
      <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
        {spectrum.items.map((i) => (
          <span key={i.source + i.url} className="inline-flex items-center gap-1 text-stone-600">
            <span className="h-2 w-2 rounded-full" style={{ background: sourceColor(i.source) }} />
            {i.source.split(" (")[0]}
            <span className="font-bold tabular-nums" style={{ color: sourceColor(i.source) }}>
              {fmt(i.stars)}
            </span>
          </span>
        ))}
      </p>
    </div>
  );
}
