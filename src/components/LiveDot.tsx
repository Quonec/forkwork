"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Live = { live: number; top: { id: number; title: string; chefName: string } | null };

/**
 * Красная точка в левом нижнем углу: появляется только пока идёт стрим (раз в полминуты спрашивает сервер),
 * нажатие ведёт в эфир. Когда эфиров нет, на экране ничего нет.
 */
export default function LiveDot() {
  const [data, setData] = useState<Live | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/streams/live", { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<Live>) : null))
        .then((d) => alive && setData(d))
        .catch(() => {});
    load();
    const t = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (!data || data.live === 0 || !data.top) return null;
  const label = `Идёт эфир: ${data.top.title}${data.top.chefName ? ` · ${data.top.chefName}` : ""}${data.live > 1 ? ` (всего эфиров: ${data.live})` : ""}`;

  return (
    <Link
      href={`/streams/${data.top.id}`}
      aria-label={label}
      title={label}
      className="fw-live fixed bottom-[4.75rem] left-3 z-[1135] flex h-5 w-5 items-center justify-center rounded-full bg-white/85 shadow-md ring-1 ring-stone-200 backdrop-blur-sm md:bottom-5 md:left-4"
    >
      <span className="live-dot block h-2.5 w-2.5 rounded-full bg-red-500" />
    </Link>
  );
}
