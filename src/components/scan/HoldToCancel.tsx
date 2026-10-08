"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

const HOLD_MS = 1000;
const HINT_MS = 1500;
const RADIUS = 9;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * «Отмена» удержанием в 1 секунду: кольцо заполняется, пока кнопка нажата;
 * отпустили раньше — ничего не отменяется, подпись на 1,5 с меняется на
 * «Удерживайте 1 секунду». Работает мышью, пальцем и клавишей (Space / Enter).
 */
export default function HoldToCancel({ onCommit }: { onCommit: () => void }) {
  const ring = useRef<SVGCircleElement>(null);
  const hold = useRef<{ frame: number } | null>(null);
  const hintTimer = useRef<number | null>(null);
  const [hinting, setHinting] = useState(false);
  const hintId = useId();

  const draw = (fraction: number) => {
    ring.current?.setAttribute("stroke-dashoffset", String(CIRCUMFERENCE * (1 - fraction)));
  };

  const stop = (explain: boolean) => {
    const pressed = hold.current !== null;
    if (hold.current) cancelAnimationFrame(hold.current.frame);
    hold.current = null;
    draw(0);
    if (!explain || !pressed) return;
    if (hintTimer.current !== null) window.clearTimeout(hintTimer.current);
    setHinting(true);
    hintTimer.current = window.setTimeout(() => {
      hintTimer.current = null;
      setHinting(false);
    }, HINT_MS);
  };

  const begin = () => {
    if (hold.current) return;
    const since = performance.now();
    const step = (ts: number) => {
      const fraction = Math.min(1, Math.max(0, ts - since) / HOLD_MS);
      draw(fraction);
      if (fraction >= 1) {
        hold.current = null;
        onCommit();
        return;
      }
      if (hold.current) hold.current.frame = requestAnimationFrame(step);
    };
    hold.current = { frame: requestAnimationFrame(step) };
  };

  useEffect(() => {
    const running = hold;
    const hintTimeout = hintTimer;
    return () => {
      if (running.current) cancelAnimationFrame(running.current.frame);
      if (hintTimeout.current !== null) window.clearTimeout(hintTimeout.current);
    };
  }, []);

  const isHoldKey = (e: KeyboardEvent) => e.key === " " || e.key === "Enter";

  return (
    <>
      <button
        type="button"
        aria-describedby={hintId}
        onPointerDown={(e) => {
          e.preventDefault();
          begin();
        }}
        onPointerUp={() => stop(true)}
        onPointerLeave={() => stop(false)}
        onPointerCancel={() => stop(false)}
        onKeyDown={(e) => {
          if (!isHoldKey(e)) return;
          e.preventDefault();
          if (!e.repeat) begin();
        }}
        onKeyUp={(e) => {
          if (isHoldKey(e)) stop(true);
        }}
        onBlur={() => stop(false)}
        onContextMenu={(e) => e.preventDefault()}
        className="flex h-12 w-full touch-none select-none items-center justify-center gap-3 rounded-full bg-orange-900 text-base font-semibold text-white active:scale-[0.98]"
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6 -rotate-90" aria-hidden>
          <circle cx="12" cy="12" r={RADIUS} fill="none" strokeWidth="2.5" className="stroke-orange-700" />
          <circle
            ref={ring}
            cx="12"
            cy="12"
            r={RADIUS}
            fill="none"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE}
            className="stroke-red-500"
          />
        </svg>
        <span>{hinting ? "Удерживайте 1 секунду" : "Отмена"}</span>
      </button>
      <span id={hintId} className="sr-only">
        Удерживайте 1 секунду
      </span>
    </>
  );
}
