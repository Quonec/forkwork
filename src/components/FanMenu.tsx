"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export type FanItem = { href: string; label: string; short: string; icon: FanIcon; hint: string };
export type FanIcon = "cabinet" | "streams" | "chefs" | "recipes" | "scan" | "map" | "chats" | "kitchen" | "manager" | "admin" | "login" | "register" | "settings";

const SIZE = 52; // диаметр кнопки-веера, px (цель нажатия не меньше 48)
const MARGIN = 6; // отступ от краёв экрана
const HINT_FLAG = "fw-fan-hint";

const ICONS: Record<FanIcon, React.ReactNode> = {
  cabinet: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.8-3.5 3.6-5.5 7-5.5s6.2 2 7 5.5" /></>,
  streams: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m10.5 9.5 4 2.5-4 2.5v-5Z" /></>,
  chefs: <path d="M7 14a4 4 0 1 1 1.5-7.7A4 4 0 0 1 16 6.5 4 4 0 1 1 17 14v5H7v-5Z" />,
  recipes: <><path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Z" /><path d="M8 16h10" /></>,
  scan: <><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" /><circle cx="12" cy="12" r="3" /></>,
  map: <><path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" /><circle cx="12" cy="10" r="2.5" /></>,
  chats: <path d="M4 5h16v11H9l-5 4V5Z" />,
  kitchen: <path d="M7 14a4 4 0 1 1 1.5-7.7A4 4 0 0 1 16 6.5 4 4 0 1 1 17 14v5H7v-5Z" />,
  manager: <><rect x="4" y="8" width="16" height="11" rx="2" /><path d="M9 8V5h6v3" /></>,
  admin: <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3Z" />,
  login: <><path d="M10 17l5-5-5-5" /><path d="M15 12H4" /><path d="M20 4v16" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /></>,
  register: <><circle cx="10" cy="8" r="3.5" /><path d="M3 20c.8-3.5 3.2-5.5 7-5.5M18 9v6M15 12h6" /></>,
};

type Pos = { dx: number; dy: number };

/**
 * Раскладка веера под большой палец: «Ещё» стоит в правом нижнем углу, поэтому кнопки
 * раскрываются двумя дугами вверх и влево от неё (по ближней дуге три самых нужных, по дальней остальные).
 * Радиусы подгоняются под ширину экрана, а положения зажимаются в пределах окна, чтобы ничего не уходило за край.
 * Углы ограничены, чтобы дуга не заходила на центральную кнопку сканера.
 */
function layout(count: number, origin: { x: number; y: number }, vw: number, vh: number): Pos[] {
  const inner = Math.min(3, count);
  const outer = count - inner;
  // кнопка «Ещё» может стоять слева (режим для левой руки): тогда дуги зеркально уходят вправо
  const dir = origin.x < vw / 2 ? -1 : 1;
  const room = dir === 1 ? origin.x : vw - origin.x;
  const fit = Math.min(1, Math.max(0.6, (room - SIZE / 2 - MARGIN) / 214));
  const rings: { n: number; r: number; from: number; to: number }[] = [
    { n: inner, r: 104 * fit, from: 90, to: 146 },
    { n: outer, r: 190 * fit, from: 86, to: 150 },
  ];
  const out: Pos[] = [];
  for (const ring of rings) {
    for (let i = 0; i < ring.n; i++) {
      const t = ring.n === 1 ? 0.5 : i / (ring.n - 1);
      const a = ((ring.from + (ring.to - ring.from) * t) * Math.PI) / 180;
      let x = origin.x + dir * ring.r * Math.cos(a);
      let y = origin.y - ring.r * Math.sin(a);
      x = Math.min(vw - SIZE / 2 - MARGIN, Math.max(SIZE / 2 + MARGIN, x));
      y = Math.min(vh - SIZE / 2 - MARGIN, Math.max(SIZE / 2 + MARGIN + 56, y));
      out.push({ dx: x - origin.x, dy: y - origin.y });
    }
  }
  return out;
}

/** Веерное меню «Ещё»: раскрывается из кнопки дугами под большой палец правой руки. */
export default function FanMenu({
  open,
  onClose,
  items,
  anchor,
  pathname,
}: {
  open: boolean;
  onClose: () => void;
  items: FanItem[];
  anchor: React.RefObject<HTMLElement | null>;
  pathname: string;
}) {
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);
  const [geo, setGeo] = useState<{ origin: { x: number; y: number }; pos: Pos[]; top: number } | null>(null);
  const [hint, setHint] = useState(false);

  // Появление: сначала ставим кнопки в точку «Ещё», на следующем кадре разводим по дугам; закрытие — обратно.
  useEffect(() => {
    if (open) {
      const r = anchor.current?.getBoundingClientRect();
      const origin = r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: window.innerWidth - 40, y: window.innerHeight - 40 };
      const vw = window.innerWidth;
      const pos = layout(items.length, origin, vw, window.innerHeight);
      // Верх веера: подсказка встаёт над ним
      const top = Math.min(...pos.map((p) => origin.y + p.dy)) - SIZE / 2;
      setGeo({ origin, pos, top });
      setMounted(true);
      // Разовая подсказка о разделах веера: при первом раскрытии в браузере
      try {
        if (!localStorage.getItem(HINT_FLAG)) {
          localStorage.setItem(HINT_FLAG, "1");
          setHint(true);
        }
      } catch {}
      const f = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(f);
    }
    setShown(false);
    setHint(false);
    const t = setTimeout(() => setMounted(false), 260);
    return () => clearTimeout(t);
  }, [open, items.length, anchor]);

  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(false), 12000);
    return () => clearTimeout(t);
  }, [hint]);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, onClose]);

  if (!mounted || !geo) return null;

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label="Закрыть меню"
        onClick={onClose}
        className={`fixed inset-0 z-[1205] bg-stone-950/30 transition-opacity duration-200 motion-reduce:transition-none ${shown ? "opacity-100" : "opacity-0"}`}
      />
      {hint && (
        <div
          role="note"
          data-fan-hint
          className={`fixed inset-x-3 z-[1210] rounded-2xl bg-white/80 shadow-md shadow-stone-950/10 ring-1 ring-yellow-400/50 backdrop-blur-md p-3 transition-opacity duration-300 motion-reduce:transition-none ${shown ? "opacity-100" : "opacity-0"}`}
          style={{ bottom: window.innerHeight - geo.top + 12 }}
        >
          <p className="text-xs font-bold text-stone-900">Что в меню «Ещё»</p>
          <ul className="mt-1.5 space-y-1">
            {items.map((it) => (
              <li key={it.href} className="text-[11px] leading-snug text-stone-600">
                <span className="font-bold text-stone-900">{it.label}</span>: {it.hint}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-stone-400">Карта и сканер на большой кнопке по центру. Зажмите угловую кнопку или нажмите её дважды: так открывается и скрывается AI-агент.</p>
          <button type="button" onClick={() => setHint(false)} className="mt-1.5 rounded-full bg-stone-950/80 px-3 py-1 text-[11px] font-bold text-yellow-300">
            Понятно
          </button>
        </div>
      )}
      <div role="menu" aria-label="Разделы" className="pointer-events-none fixed inset-0 z-[1210]">
        {items.map((it, i) => {
          const p = geo.pos[i]!;
          const active = pathname.startsWith(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              role="menuitem"
              aria-label={it.label}
              title={it.hint}
              aria-current={active ? "page" : undefined}
              onClick={onClose}
              className={`pointer-events-auto absolute flex flex-col items-center justify-center gap-0.5 rounded-full text-[9px] font-bold leading-none shadow-lg shadow-stone-950/30 ring-2 ring-white transition-[transform,opacity] duration-300 ease-out motion-reduce:transition-none ${
                active ? "bg-yellow-400 text-stone-950" : "bg-stone-950 text-white"
              }`}
              style={{
                width: SIZE,
                height: SIZE,
                left: geo.origin.x - SIZE / 2,
                top: geo.origin.y - SIZE / 2,
                transform: shown ? `translate(${p.dx}px, ${p.dy}px) scale(1)` : "translate(0, 0) scale(0.3)",
                opacity: shown ? 1 : 0,
                transitionDelay: shown ? `${i * 28}ms` : "0ms",
              }}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {ICONS[it.icon]}
              </svg>
              <span>{it.short}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
