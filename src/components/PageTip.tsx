"use client";

import { useEffect, useState } from "react";

export type TipStep = { title: string; text: string };

const key = (id: string) => `fw-tip:${id}`;

/**
 * Разовая подсказка по странице: короткая карточка из нескольких шагов. Показывается один раз
 * на браузер (отметка ставится сразу, перезагрузка её не возвращает) и закрывается кнопкой.
 * Без доступного хранилища браузера не показывается вовсе.
 */
export default function PageTip({ id, steps, className = "" }: { id: string; steps: TipStep[]; className?: string }) {
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);

  useEffect(() => {
    try {
      if (localStorage.getItem(key(id))) return;
      localStorage.setItem(key(id), "1");
      setOpen(true);
    } catch {}
  }, [id]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => setOpen(false), 25000);
    return () => clearTimeout(t);
  }, [open, i]);

  if (!open) return null;
  const step = steps[i]!;
  const last = i === steps.length - 1;

  return (
    <div
      role="dialog"
      aria-label="Подсказка"
      data-page-tip={id}
      className={`rounded-2xl bg-white/80 shadow-md shadow-stone-950/10 ring-1 ring-yellow-400/50 backdrop-blur-md p-3 ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-bold text-stone-900">{step.title}</p>
        <span className="shrink-0 text-[11px] tabular-nums text-stone-400">
          {i + 1} / {steps.length}
        </span>
      </div>
      <p className="mt-0.5 text-[11px] leading-relaxed text-stone-600">{step.text}</p>
      <div className="mt-2 flex items-center justify-between">
        <button type="button" onClick={() => setOpen(false)} className="text-[11px] text-stone-400 underline hover:text-stone-600">
          Закрыть
        </button>
        <button
          type="button"
          onClick={() => (last ? setOpen(false) : setI(i + 1))}
          className="rounded-full bg-stone-950/80 px-3 py-1 text-[11px] font-bold text-yellow-300"
        >
          {last ? "Понятно" : "Дальше"}
        </button>
      </div>
    </div>
  );
}
