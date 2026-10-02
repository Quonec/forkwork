"use client";

import { useEffect, useState } from "react";
import FwBubbles, { BUBBLE_TOTAL, type BubbleSettings } from "./FwBubbles";

const KEY = "fw-bubbles-hero";
/** На тёмной заставке круги по умолчанию приглушены, чтобы не спорить с текстом. */
const DEFAULTS: BubbleSettings = { count: BUBBLE_TOTAL, speed: 1, intensity: 0.45 };

function load(): BubbleSettings {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (j && typeof j.count === "number" && typeof j.speed === "number" && typeof j.intensity === "number") {
      return {
        count: Math.min(BUBBLE_TOTAL, Math.max(0, Math.round(j.count))),
        speed: Math.min(2.5, Math.max(0.4, j.speed)),
        intensity: Math.min(1, Math.max(0.15, j.intensity)),
      };
    }
  } catch {}
  return DEFAULTS;
}

/** Круги на главной заставке с настройкой ползунками (количество, скорость, яркость). */
export default function HeroBubbles() {
  const [s, setS] = useState<BubbleSettings>(DEFAULTS);

  // Сохранённые настройки читаем после загрузки, чтобы разметка совпала с серверной.
  useEffect(() => setS(load()), []);
  const set = (patch: Partial<BubbleSettings>) =>
    setS((cur) => {
      const next = { ...cur, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {}
      return next;
    });

  const row = (id: string, label: string, value: string, input: React.ReactNode) => (
    <label className="block" htmlFor={id}>
      <span className="flex justify-between text-[11px] text-stone-300">
        <span>{label}</span>
        <span className="tabular-nums">{value}</span>
      </span>
      {input}
    </label>
  );

  return (
    <>
      <FwBubbles {...s} tone="dark" />
      <details className="absolute right-3 top-3 z-20 w-fit rounded-2xl bg-white/10 px-3 py-2 text-white backdrop-blur open:w-56">
        <summary className="cursor-pointer select-none text-center text-[11px] font-semibold text-stone-300">Настроить круги</summary>
        <div className="mt-2 space-y-2">
          {row(
            "hero-count",
            "Количество",
            String(s.count),
            <input id="hero-count" type="range" min={0} max={BUBBLE_TOTAL} step={1} value={s.count} onChange={(e) => set({ count: Number(e.target.value) })} className="mt-1 w-full accent-yellow-400" />,
          )}
          {row(
            "hero-speed",
            "Скорость",
            `×${s.speed.toFixed(1)}`,
            <input id="hero-speed" type="range" min={0.4} max={2.5} step={0.1} value={s.speed} onChange={(e) => set({ speed: Number(e.target.value) })} className="mt-1 w-full accent-yellow-400" />,
          )}
          {row(
            "hero-intensity",
            "Яркость",
            `${Math.round(s.intensity * 100)}%`,
            <input id="hero-intensity" type="range" min={0.15} max={1} step={0.05} value={s.intensity} onChange={(e) => set({ intensity: Number(e.target.value) })} className="mt-1 w-full accent-yellow-400" />,
          )}
          <button type="button" onClick={() => set(DEFAULTS)} className="w-full text-center text-[11px] text-stone-400 underline hover:text-stone-200">
            Сбросить
          </button>
        </div>
      </details>
    </>
  );
}
