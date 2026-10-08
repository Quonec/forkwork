"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

export type PeekKind = "streams" | "chefs" | "recipes";
/** Превью одного элемента раздела, которое выпадает под полосой при наведении на счётчик. */
export type Peek = { node: ReactNode; href: string; cta: string };

const SWIPE = 28; // px сдвига, после которого жест считается свайпом
const HIDE_DELAY = 220; // мс до закрытия превью после ухода курсора

/**
 * Шторка на главной: «Сейчас в эфире», «Лучшие повара недели» и «Свежие рецепты» свёрнуты в полосу
 * со счётчиками пополнений за неделю. Раскрывается свайпом вниз по полосе, нажатием или клавишей «вниз»,
 * сворачивается свайпом вверх, нажатием или «вверх». Пока шторка закрыта, наведение на счётчик
 * (на телефоне нажатие) выпадает превью одного элемента раздела.
 */
export default function HomeDrawer({
  live,
  chefsNew,
  recipesNew,
  previews,
  children,
}: {
  live: number;
  chefsNew: number;
  recipesNew: number;
  previews: Record<PeekKind, Peek | null>;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const startY = useRef<number | null>(null);
  const swiped = useRef(false);

  const [peek, setPeek] = useState<PeekKind | null>(null);
  const [last, setLast] = useState<PeekKind | null>(null); // чтобы при сворачивании содержимое не исчезало раньше панели
  const [pinned, setPinned] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const zone = useRef<HTMLDivElement>(null);

  const show = (k: PeekKind) => {
    clearTimeout(timer.current);
    if (!previews[k]) return;
    setPeek(k);
    setLast(k);
  };
  const hideSoon = () => {
    if (pinned) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setPeek(null), HIDE_DELAY);
  };
  const hideNow = () => {
    clearTimeout(timer.current);
    setPinned(false);
    setPeek(null);
  };

  // Закреплённое нажатием превью закрывается нажатием в стороне и клавишей Escape
  useEffect(() => {
    if (!peek) return;
    const down = (e: PointerEvent) => {
      if (zone.current && !zone.current.contains(e.target as Node)) hideNow();
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && hideNow();
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", esc);
    };
  }, [peek]);

  const setOpenAndClosePeek = (v: boolean) => {
    if (v) hideNow();
    setOpen(v);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    startY.current = e.clientY;
    swiped.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (startY.current === null) return;
    const dy = e.clientY - startY.current;
    startY.current = null;
    if (dy > SWIPE) {
      swiped.current = true; // следующий click от этого же касания игнорируем
      setOpenAndClosePeek(true);
    } else if (dy < -SWIPE) {
      swiped.current = true;
      setOpenAndClosePeek(false);
    }
  };
  const onClick = () => {
    if (swiped.current) {
      swiped.current = false;
      return;
    }
    setOpenAndClosePeek(!open);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpenAndClosePeek(true);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setOpenAndClosePeek(false);
    }
  };

  const chip = (kind: PeekKind, tone: string, content: ReactNode) => {
    const enabled = !open && previews[kind] !== null;
    return (
      <button
        type="button"
        aria-expanded={enabled && peek === kind}
        aria-controls="home-peek"
        disabled={!enabled}
        onMouseEnter={() => enabled && show(kind)}
        onMouseLeave={hideSoon}
        onFocus={() => enabled && show(kind)}
        onBlur={hideSoon}
        onClick={() => {
          if (!enabled) return;
          if (peek === kind && pinned) hideNow();
          else {
            setPinned(true);
            show(kind);
          }
        }}
        className={`chip ${tone} ${enabled ? "cursor-pointer hover:ring-2 hover:ring-yellow-400/60" : "cursor-default"} ${peek === kind ? "ring-2 ring-yellow-400" : ""}`}
      >
        {content}
      </button>
    );
  };

  const shown = last ? previews[last] : null;

  return (
    <section className="mx-auto max-w-7xl px-4 pt-6 sm:px-6" aria-label="Сейчас на ForkWork">
      <div className="card overflow-hidden">
        <button
          type="button"
          aria-expanded={open}
          aria-controls="home-drawer-panel"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => (startY.current = null)}
          onClick={onClick}
          onKeyDown={onKeyDown}
          style={{ touchAction: "none" }}
          className="block w-full px-4 pb-2 pt-2 text-left"
        >
          <span className="mx-auto mb-2 block h-1 w-10 rounded-full bg-stone-300" aria-hidden="true" />
          <span className="flex items-center justify-between gap-3">
            <span className="font-display text-lg tracking-tight">Сегодня на ForkWork</span>
            <span className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-stone-400">
              {open ? "свайп вверх" : "свайп вниз"}
              <svg viewBox="0 0 24 24" className={`h-4 w-4 transition-transform duration-300 motion-reduce:transition-none ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </span>
          </span>
        </button>

        {/* Счётчики за неделю; наведение (на телефоне нажатие) выпадает превью одного элемента из раздела */}
        <div ref={zone} className="px-4 pb-3" onMouseLeave={hideSoon}>
          <div className="flex flex-wrap items-center gap-1.5">
            {chip(
              "streams",
              "bg-red-50 text-red-700",
              <>
                <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-red-500" /> {live > 0 ? `${live} в эфире` : "эфиров нет"}
              </>,
            )}
            {chip("chefs", "bg-yellow-100 text-stone-800", <>Повара +{chefsNew}</>)}
            {chip("recipes", "bg-yellow-100 text-stone-800", <>Рецепты +{recipesNew}</>)}
            <span className="text-[11px] text-stone-400">пополнения за неделю</span>
          </div>

          <div
            id="home-peek"
            onMouseEnter={() => clearTimeout(timer.current)}
            className={`grid transition-[grid-template-rows] duration-200 motion-reduce:transition-none ${peek && !open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
          >
            <div className="overflow-hidden" inert={!peek || open}>
              {shown && (
                <div className="pt-2.5">
                  {shown.node}
                  <Link href={shown.href} className="mt-1.5 inline-block text-xs font-semibold text-orange-700 hover:underline">
                    {shown.cta} →
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={`grid transition-[grid-template-rows] duration-300 motion-reduce:transition-none ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
          <div id="home-drawer-panel" className="overflow-hidden" inert={!open}>
            <div className="space-y-8 border-t border-stone-200/70 px-4 py-6">{children}</div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Блок внутри шторки: заголовок со счётчиком пополнений за неделю и ссылкой на раздел. */
export function DrawerBlock({ title, subtitle, href, linkText, badge, children }: { title: string; subtitle: string; href: string; linkText: string; badge: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="flex flex-wrap items-center gap-2 text-lg font-extrabold">
            {title}
            <span className="chip bg-yellow-100 text-xs text-stone-800">{badge}</span>
          </h2>
          <p className="text-sm text-stone-500">{subtitle}</p>
        </div>
        <Link href={href} className="text-sm font-semibold text-orange-700 hover:underline">
          {linkText} →
        </Link>
      </div>
      {children}
    </div>
  );
}
