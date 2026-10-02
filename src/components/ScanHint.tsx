"use client";

import { useEffect, useState } from "react";

const FLAG = "fw-scan-hint";

type Spot = { x: number; y: number; below: boolean };

/** Видимая цель подсказки: на телефоне центральная кнопка панели, на компьютере пункт «Скан» в шапке. */
function findTarget(): HTMLElement | null {
  const els = Array.from(document.querySelectorAll<HTMLElement>("[data-hint='scan']"));
  return els.find((e) => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }) ?? null;
}

/**
 * Подсказка при первом заходе на главную заставку: стрелка показывает на сканер блюда.
 * Показывается один раз на браузер; закрывается кнопкой или нажатием на сам сканер.
 */
export default function ScanHint() {
  const [spot, setSpot] = useState<Spot | null>(null);

  useEffect(() => {
    if (window.location.pathname !== "/") return;
    try {
      if (localStorage.getItem(FLAG)) return;
    } catch {}

    const place = () => {
      const target = findTarget();
      if (!target) return setSpot(null);
      const r = target.getBoundingClientRect();
      setSpot({ x: r.left + r.width / 2, y: r.top + r.height / 2, below: r.top < window.innerHeight / 2 });
    };
    const done = () => {
      try {
        localStorage.setItem(FLAG, "1");
      } catch {}
      setSpot(null);
    };

    place();
    const timer = setTimeout(place, 600); // после того как панель и шапка встали на место
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, { passive: true });
    // Нажатие на сам сканер (кнопку внизу или пункт в шапке) тоже закрывает подсказку.
    const onClick = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest("[data-hint='scan']")) done();
    };
    document.addEventListener("click", onClick, true);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  if (!spot) return null;

  const close = () => {
    try {
      localStorage.setItem(FLAG, "1");
    } catch {}
    setSpot(null);
  };

  // Подпись над целью (внизу экрана) или под ней (вверху); стрелка смотрит на цель.
  const W = 232;
  const left = Math.min(Math.max(spot.x - W / 2, 12), window.innerWidth - W - 12);
  const style: React.CSSProperties = spot.below
    ? { left, top: spot.y + 34, width: W }
    : { left, bottom: window.innerHeight - spot.y + 46, width: W };

  return (
    <div className="fixed inset-0 z-[1170] pointer-events-none" role="dialog" aria-label="Подсказка: сканер блюда">
      <div style={style} className="absolute flex flex-col items-center gap-1 pointer-events-auto" data-scan-hint-card>
        {spot.below && <Arrow dir="up" offset={spot.x - left - W / 2} />}
        <div className="w-full rounded-2xl bg-white px-4 py-3 text-center text-stone-950 shadow-2xl shadow-stone-950/40 ring-2 ring-yellow-400">
          <p className="text-sm font-bold">Начните со сканера</p>
          <p className="mt-1 text-xs text-stone-600">Сфотографируйте блюдо: сервис оценит состав и КБЖУ.</p>
          <button type="button" onClick={close} className="mt-2 rounded-full bg-stone-950 px-4 py-1.5 text-xs font-bold text-yellow-300">
            Понятно
          </button>
        </div>
        {!spot.below && <Arrow dir="down" offset={spot.x - left - W / 2} />}
      </div>
    </div>
  );
}

function Arrow({ dir, offset }: { dir: "up" | "down"; offset: number }) {
  // Сдвиг к цели на внешней обёртке: на самой стрелке transform занят покачиванием.
  return (
    <span style={{ transform: `translateX(${offset}px)` }} className="block">
      <svg
        viewBox="0 0 24 32"
        width="28"
        height="36"
        aria-hidden="true"
        className={`fw-hint-arrow text-yellow-400 drop-shadow ${dir === "up" ? "fw-hint-arrow-up" : ""}`}
        fill="currentColor"
      >
        {dir === "down" ? <path d="M9 0h6v18h6L12 32 3 18h6z" /> : <path d="M9 32h6V14h6L12 0 3 14h6z" />}
      </svg>
    </span>
  );
}
