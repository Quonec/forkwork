"use client";

import { useEffect, useState } from "react";

const FLAG = "fw-scan-hint";

const mark = () => {
  try {
    localStorage.setItem(FLAG, "1");
  } catch {}
};

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
export default function ScanHint({ loggedIn }: { loggedIn: boolean }) {
  const [spot, setSpot] = useState<Spot | null>(null);

  useEffect(() => {
    // Только на главной и только тем, кто здесь впервые: вошедший пользователь уже знает сервис.
    if (window.location.pathname !== "/") return;
    if (loggedIn) return mark();
    try {
      if (localStorage.getItem(FLAG)) return;
    } catch {
      return; // без хранилища «первый раз» не определить: лучше не показывать, чем показывать каждый раз
    }

    const place = () => {
      const target = findTarget();
      if (!target) return setSpot(null);
      const r = target.getBoundingClientRect();
      setSpot({ x: r.left + r.width / 2, y: r.top + r.height / 2, below: r.top < window.innerHeight / 2 });
    };
    const done = () => {
      mark();
      setSpot(null);
    };

    const gone = setTimeout(() => setSpot(null), 14000);
    place();
    mark(); // разовая: считается показанной сразу, перезагрузка её не вернёт
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
      clearTimeout(gone);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place);
      document.removeEventListener("click", onClick, true);
    };
  }, [loggedIn]);

  if (!spot) return null;

  const close = () => {
    mark();
    setSpot(null);
  };

  // Подпись над целью (внизу экрана) или под ней (вверху); стрелка смотрит на цель.
  const W = 208;
  const left = Math.min(Math.max(spot.x - W / 2, 12), window.innerWidth - W - 12);
  const style: React.CSSProperties = spot.below
    ? { left, top: spot.y + 34, width: W }
    : { left, bottom: window.innerHeight - spot.y + 46, width: W };

  return (
    <div className="fixed inset-0 z-[1170] pointer-events-none" role="dialog" aria-label="Подсказка: сканер блюда">
      <div style={style} className="absolute flex flex-col items-center gap-1 pointer-events-auto" data-scan-hint-card>
        {spot.below && <Arrow dir="up" offset={spot.x - left - W / 2} />}
        <div className="w-full rounded-2xl bg-white/80 shadow-md shadow-stone-950/10 ring-1 ring-yellow-400/50 backdrop-blur-md px-3 py-2 text-center text-stone-900">
          <p className="text-xs font-bold">Начните со сканера</p>
          <p className="mt-0.5 text-[11px] leading-snug text-stone-600">Сфотографируйте блюдо: сервис оценит состав и КБЖУ.</p>
          <button type="button" onClick={close} className="mt-1.5 rounded-full bg-stone-950/80 px-3 py-1 text-[11px] font-bold text-yellow-300">
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
        width="22"
        height="28"
        aria-hidden="true"
        className={`fw-hint-arrow text-yellow-400/80 ${dir === "up" ? "fw-hint-arrow-up" : ""}`}
        fill="currentColor"
      >
        {dir === "down" ? <path d="M9 0h6v18h6L12 32 3 18h6z" /> : <path d="M9 32h6V14h6L12 0 3 14h6z" />}
      </svg>
    </span>
  );
}
