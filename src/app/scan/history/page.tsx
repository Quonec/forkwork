"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type { ScanListRow } from "@/lib/scan/events";
import { scanDayKey, scanDayLabel, scanTime } from "@/lib/scan/format";
import { Empty } from "@/components/ui";

const PAGE = 20;

export default function ScanHistoryPage() {
  const [rows, setRows] = useState<ScanListRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async (offset: number) => {
    setLoadError(false);
    try {
      const r = await fetch(`/api/scans?limit=${PAGE}&offset=${offset}`);
      if (r.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!r.ok) throw new Error("load");
      const d = (await r.json()) as { scans: ScanListRow[]; hasMore: boolean };
      setRows((prev) => (offset === 0 ? d.scans : [...prev, ...d.scans]));
      setHasMore(d.hasMore);
    } catch {
      setLoadError(true);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load(0);
  }, [load]);

  const groups: { key: string; label: string; items: ScanListRow[] }[] = [];
  for (const r of rows) {
    const key = scanDayKey(r.createdAt);
    const g = groups[groups.length - 1];
    if (g && g.key === key) g.items.push(r);
    else groups.push({ key, label: scanDayLabel(r.createdAt), items: [r] });
  }

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <Link href="/scan" className="text-sm font-semibold text-orange-600">
        ← К сканеру
      </Link>
      <div className="mt-3 flex items-center justify-between gap-3">
        <h1 className="font-display text-xl tracking-tight">История сканов</h1>
        <Link href="/scan/diary" className="text-sm font-semibold text-orange-600">
          Дневник →
        </Link>
      </div>

      {loadError && <p className="mt-4 text-sm text-red-600">Не получилось загрузить — попробуйте ещё раз</p>}

      {loaded && rows.length === 0 && !loadError && (
        <div className="mt-6">
          <Empty art="scans" text="Сканов пока нет. Снимите тарелку — оценка появится здесь.">
            <Link href="/scan" className="btn-primary">
              Сделать снимок
            </Link>
          </Empty>
        </div>
      )}

      {groups.map((g) => (
        <section key={g.key} className="mt-5">
          <h2 className="text-xs font-bold uppercase tracking-wide text-orange-700">{g.label}</h2>
          <ul className="mt-2 space-y-2">
            {g.items.map((r) => (
              <li key={r.id}>
                <Link href={`/scan/${r.id}`} className="card flex items-center gap-3 p-3 hover:bg-orange-50">
                  {r.thumb.available ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/scans/${r.id}/photo`} alt="" className="h-14 w-14 rounded-xl object-cover" loading="lazy" />
                  ) : (
                    <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-orange-100 text-orange-400">—</span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {r.headline ?? "Скан"}
                      {r.moreCount > 0 ? ` и ещё ${r.moreCount}` : ""}
                    </span>
                    <span className="text-xs text-stone-500">
                      {scanTime(r.createdAt)} · ≈{r.totalKcal} ккал
                    </span>
                  </span>
                  <span className="text-stone-400">›</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {hasMore && (
        <button className="btn-secondary mt-5 w-full" onClick={() => load(rows.length)}>
          Показать ещё
        </button>
      )}
    </div>
  );
}
