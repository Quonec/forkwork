"use client";

import Link from "next/link";
import { useState } from "react";

export type RouteStage = {
  num: string;
  title: string;
  steps: string[];
  links: { href: string; label: string; note: string }[];
};

/**
 * Маршрут ForkWork жалюзи: три планки рядом, одна всегда раскрыта.
 *  - Компьютер: наведение мыши (или фокус с клавиатуры) расширяет планку, остальные сужаются до полосок с номером и названием.
 *  - Телефон: планки идут столбиком, нажатие раскрывает нужную вниз.
 */
export default function RouteBook({ stages }: { stages: RouteStage[] }) {
  const [active, setActive] = useState(0);

  return (
    <div className="flex flex-col gap-2 md:h-[25rem] md:flex-row md:gap-2.5" role="list" aria-label="Стадии маршрута">
      {stages.map((s, i) => {
        const on = i === active;
        return (
          <section
            key={s.num}
            role="listitem"
            onPointerEnter={(e) => e.pointerType === "mouse" && setActive(i)}
            className={`group relative overflow-hidden rounded-2xl transition-[flex-grow,background-color] duration-500 ease-out motion-reduce:transition-none md:min-w-[4.5rem] md:basis-0 ${
              on ? "bg-[#fffefb] ring-1 ring-stone-200 md:grow-[8]" : "bg-stone-900 text-stone-100 md:grow-[1]"
            }`}
          >
            {/* Шапка планки: номер и название; у суженной планки на компьютере название стоит вертикально */}
            <button
              type="button"
              aria-expanded={on}
              aria-controls={`route-slat-${i}`}
              onClick={() => setActive(i)}
              onFocus={() => setActive(i)}
              className={`flex w-full items-center gap-3 px-5 py-4 text-left md:absolute md:inset-x-0 md:top-0 md:z-10 md:py-5 ${on ? "" : "md:h-full md:flex-col md:items-center md:justify-start md:px-0"}`}
            >
              <span className={`font-display text-2xl leading-none ${on ? "text-yellow-500" : "text-yellow-400"}`}>{s.num}</span>
              <span
                className={`min-w-0 flex-1 text-sm font-bold md:flex-none ${on ? "md:hidden" : "md:[writing-mode:vertical-rl] md:rotate-180 md:whitespace-nowrap md:text-xs md:tracking-wide md:text-stone-300"}`}
              >
                {s.title}
              </span>
              <svg viewBox="0 0 24 24" className={`h-4 w-4 shrink-0 transition-transform duration-300 md:hidden ${on ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            {/* Содержимое: на телефоне раскрывается вниз, на компьютере вправо; ширина фиксирована, чтобы текст не перестраивался во время движения */}
            <div className={`grid transition-[grid-template-rows] duration-500 ease-out motion-reduce:transition-none md:block md:h-full ${on ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
              <div id={`route-slat-${i}`} inert={!on} className={`overflow-hidden transition-opacity duration-300 md:h-full ${on ? "opacity-100 md:delay-200" : "opacity-0"}`}>
                <div className="px-5 pb-6 md:flex md:h-full md:min-w-[34rem] md:gap-8 md:px-8 md:pb-6 md:pt-5">
                  <div className="md:flex-1 md:pt-11">
                    <h3 className="font-display hidden text-2xl leading-tight md:block">{s.title}</h3>
                    <ol className="mt-4 space-y-2.5">
                      {s.steps.map((step, k) => (
                        <li key={step} className="flex gap-3 text-sm text-stone-700">
                          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-yellow-100 text-xs font-bold text-stone-900">{k + 1}</span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                  <ul className="mt-5 space-y-2 md:mt-0 md:w-64 md:shrink-0 md:pt-11">
                    {s.links.map((l, k) => (
                      <li key={l.href}>
                        <Link
                          href={l.href}
                          className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 transition-colors ${k === 0 ? "bg-yellow-400 text-stone-950 hover:bg-yellow-300" : "bg-stone-50 text-stone-800 ring-1 ring-stone-200 hover:bg-yellow-50"}`}
                        >
                          <span>
                            <span className="block text-sm font-bold">{l.label}</span>
                            <span className="block text-xs opacity-75">{l.note}</span>
                          </span>
                          <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M5 12h14M13 6l6 6-6 6" />
                          </svg>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
