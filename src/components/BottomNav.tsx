"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import FanMenu, { type FanItem } from "./FanMenu";
import { useCart } from "./cart";
import { usePrefs } from "@/lib/prefs";

type Item = { href: string; label: string; icon: (active: boolean) => React.ReactNode };
type Mode = "scan" | "map";

const STORAGE_KEY = "fw-center-mode";

const svg = (a: boolean, children: React.ReactNode) => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={a ? 2.4 : 2} strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

const LEFT: Item[] = [
  {
    href: "/favorites",
    label: "Любимое",
    icon: (a) => svg(a, <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />),
  },
  {
    href: "/venues",
    label: "Заведения",
    icon: (a) =>
      svg(
        a,
        <>
          <path d="M4 10h16l-1-5H5l-1 5Z" />
          <path d="M5 10v9h14v-9M10 19v-5h4v5" />
        </>,
      ),
  },
];

const RIGHT: Item[] = [
  {
    href: "/cart",
    label: "Корзина",
    icon: (a) =>
      svg(
        a,
        <>
          <circle cx="9" cy="20" r="1.4" />
          <circle cx="17" cy="20" r="1.4" />
          <path d="M3 4h2.2l2.4 11.2a1.6 1.6 0 0 0 1.6 1.3h7.9a1.6 1.6 0 0 0 1.6-1.3L20.5 8H6" />
        </>,
      ),
  },
];

/** Остальные разделы: раскрываются веером из кнопки «Ещё». Карта и сканер вынесены на центральную кнопку, в веере их нет. */
const MORE: FanItem[] = [
  { href: "/cabinet", label: "Кабинет", short: "Кабинет", icon: "cabinet", hint: "заказы, избранное и кошелёк ForkCoins" },
  { href: "/streams", label: "Стримы", short: "Стримы", icon: "streams", hint: "прямые эфиры поваров, заказ блюда из эфира" },
  { href: "/chefs", label: "Повара", short: "Повара", icon: "chefs", hint: "каталог поваров с рейтингом" },
  { href: "/recipes", label: "Рецепты", short: "Рецепты", icon: "recipes", hint: "рецепты поваров, шефов и из кино" },
  { href: "/chats", label: "Чаты", short: "Чаты", icon: "chats", hint: "личные переписки с поварами, шифрование по желанию" },
  { href: "/settings", label: "Настройки", short: "Настройки", icon: "settings", hint: "тема по времени суток, цвет, нижняя панель" },
];

const CENTER: Record<Mode, { href: string; label: string }> = {
  scan: { href: "/scan", label: "Сканер блюда" },
  map: { href: "/map", label: "Карта" },
};

/** Свой кабинет роли: на телефоне он первым в веере. */
const ROLE_HOME: Record<string, FanItem> = {
  chef: { href: "/kitchen", label: "Поварской кабинет", short: "Кухня", icon: "kitchen", hint: "ваши блюда, заказы, стримы и финансы" },
  manager: { href: "/manager", label: "Кабинет менеджера", short: "Менеджер", icon: "manager", hint: "ваши повара и их клиенты" },
  admin: { href: "/admin", label: "Админ-панель", short: "Админ", icon: "admin", hint: "пользователи, жалобы, заявки" },
};

/** Гостю вместо разделов, требующих входа, — вход и регистрация. */
const NEEDS_LOGIN = ["/favorites", "/cabinet", "/chats"];
const GUEST: FanItem[] = [
  { href: "/login", label: "Войти", short: "Войти", icon: "login", hint: "вход в аккаунт" },
  { href: "/register", label: "Регистрация", short: "Вступить", icon: "register", hint: "создать аккаунт и получить 500 FC" },
];

/** Спицы веера: угол поворота у сложенного и раскрытого веера (против часовой стрелки от вертикали). */
const FAN_BLADES = [
  { closed: -27, open: 0 },
  { closed: -36, open: -22.5 },
  { closed: -45, open: -45 },
  { closed: -54, open: -67.5 },
  { closed: -63, open: -90 },
];

export default function BottomNav({ role }: { role: string | null }) {
  const guest = role === null;
  const moreItems: FanItem[] = guest
    ? [...GUEST, ...MORE.filter((m) => !NEEDS_LOGIN.includes(m.href))]
    : [...(ROLE_HOME[role] ? [ROLE_HOME[role]] : []), ...MORE];
  const left = guest ? LEFT.map((it) => (it.href === "/favorites" ? { ...it, href: "/login", label: "Войти" } : it)) : LEFT;
  const pathname = usePathname();
  const { hand, labels } = usePrefs();
  const { count } = useCart();
  const [mode, setMode] = useState<Mode>("scan");
  const [more, setMore] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  // Жесты на кнопке веера: нажатие раскрывает веер, зажатие или двойное нажатие открывает AI-агента
  const pressTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const longPressed = useRef(false);
  const lastTap = useRef(0);
  const openAi = () => {
    setMore(false);
    window.dispatchEvent(new CustomEvent("fw:toggle-ai")); // открывает AI-агента, а если он уже открыт, скрывает
  };
  useEffect(() => setMore(false), [pathname]);

  // Запомненный режим — после гидрации, чтобы серверная и клиентская разметка совпали.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "scan" || saved === "map") setMode(saved);
    } catch {}
  }, []);

  // Зашли на карту или в сканер другим путём — кнопка подстраивается.
  useEffect(() => {
    const next: Mode | null = pathname.startsWith("/map") ? "map" : pathname.startsWith("/scan") ? "scan" : null;
    if (next) {
      setMode(next);
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {}
    }
  }, [pathname]);

  const toggle = () => {
    const next: Mode = mode === "scan" ? "map" : "scan";
    setMode(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  };

  const centerActive = pathname.startsWith(CENTER[mode].href);
  const other: Mode = mode === "scan" ? "map" : "scan";

  const renderItem = (it: Item) => {
    const active = pathname.startsWith(it.href);
    return (
      <Link
        key={it.href}
        href={it.href}
        className={`relative flex flex-col items-center gap-0.5 py-2 text-[10px] font-semibold ${
          active ? "text-stone-950" : "text-stone-500"
        }`}
      >
        {active && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-yellow-400" />}
        {it.icon(active)}
        {it.href === "/cart" && count > 0 && (
          <span className="absolute right-1/2 top-1 -mr-5 flex h-4 min-w-4 items-center justify-center rounded-full bg-stone-950 px-1 text-[9px] font-bold text-white">
            {count}
          </span>
        )}
        {labels && it.label}
      </Link>
    );
  };

  return (
    <>
      <FanMenu open={more} onClose={() => setMore(false)} items={moreItems} anchor={moreRef} pathname={pathname} />
      <nav className="fixed inset-x-0 bottom-0 z-[1150] border-t border-stone-200 bg-white md:hidden">
        <div className="grid grid-cols-5">
          {hand === "left" && <div aria-hidden="true" />}
          {left.map(renderItem)}
          <div aria-hidden="true" />
          {RIGHT.map(renderItem)}
          {hand === "right" && <div aria-hidden="true" />}
        </div>
      </nav>

      {/* «Ещё» в правом углу: тёмный круг с плюсом; при раскрытии веера жёлтый, плюс поворачивается в крестик */}
      <button
        ref={moreRef}
        type="button"
        onPointerDown={() => {
          longPressed.current = false;
          clearTimeout(pressTimer.current);
          pressTimer.current = setTimeout(() => {
            longPressed.current = true;
            navigator.vibrate?.(15);
            openAi();
          }, 480);
        }}
        onPointerUp={() => clearTimeout(pressTimer.current)}
        onPointerLeave={() => clearTimeout(pressTimer.current)}
        onPointerCancel={() => clearTimeout(pressTimer.current)}
        onContextMenu={(e) => e.preventDefault()}
        onClick={() => {
          if (longPressed.current) {
            longPressed.current = false;
            return;
          }
          const now = Date.now();
          if (now - lastTap.current < 320) {
            lastTap.current = 0;
            openAi();
            return;
          }
          lastTap.current = now;
          setMore((v) => !v);
        }}
        aria-expanded={more}
        aria-haspopup="menu"
        aria-label="Ещё. Зажмите или нажмите дважды, чтобы открыть или скрыть AI-агента"
        title="Ещё (зажмите или нажмите дважды: AI-агент)"
        className={`fixed ${hand === "left" ? "left-3" : "right-3"} flex h-14 w-14 items-center justify-center rounded-full shadow-lg shadow-stone-950/30 ring-4 ring-white transition-colors duration-200 active:scale-95 md:hidden ${
          more ? "z-[1215] bg-yellow-400 text-stone-950" : "z-[1160] bg-stone-950 text-white"
        }`}
        style={{ bottom: "calc(0.5cm + env(safe-area-inset-bottom, 0px))", touchAction: "manipulation", WebkitTouchCallout: "none", userSelect: "none" }}
      >
        {/* Веер из угла: пять спиц вращаются вокруг нижнего правого угла значка; закрыт — сложен, открыт — раскрыт */}
        <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true">
          <path d="M5 21A16 16 0 0 1 21 5" className={`transition-opacity duration-300 ${more ? "opacity-70" : "opacity-30"}`} />
          {FAN_BLADES.map((b, i) => (
            <line
              key={i}
              x1="21"
              y1="21"
              x2="21"
              y2="5"
              style={{
                transformOrigin: "21px 21px",
                transform: `rotate(${more ? b.open : b.closed}deg)`,
                transition: "transform 380ms cubic-bezier(0.2, 0.8, 0.2, 1)",
                transitionDelay: `${i * 20}ms`,
              }}
            />
          ))}
        </svg>
      </button>

      {/* Центральная кнопка: по центру, на 0,5 см выше нижнего края. Нажатие открывает текущий режим, значок ⇄ меняет режим. */}
      <div
        className="fixed left-1/2 z-[1160] h-16 w-16 -translate-x-1/2 md:hidden"
        style={{ bottom: "calc(0.5cm + env(safe-area-inset-bottom, 0px))" }}
      >
        <Link
          href={CENTER[mode].href}
          aria-label={CENTER[mode].label}
          aria-current={centerActive ? "page" : undefined}
          data-hint={mode === "scan" ? "scan" : undefined}
          className={`relative flex h-full w-full items-center justify-center rounded-full bg-yellow-400 text-stone-950 shadow-lg shadow-stone-950/25 ring-4 ring-white transition-transform active:scale-95 ${
            centerActive ? "outline outline-2 outline-offset-2 outline-stone-950" : ""
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className={`absolute h-7 w-7 transition-all duration-300 ${mode === "scan" ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-50 opacity-0"}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
            <circle cx="12" cy="12" r="3.2" />
          </svg>
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className={`absolute h-7 w-7 transition-all duration-300 ${mode === "map" ? "rotate-0 scale-100 opacity-100" : "rotate-90 scale-50 opacity-0"}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" />
            <circle cx="12" cy="10" r="2.5" />
          </svg>
        </Link>
        <button
          type="button"
          onClick={toggle}
          aria-label={`Переключить кнопку на «${CENTER[other].label}»`}
          className="absolute -right-3 -top-3 flex h-8 w-8 items-center justify-center rounded-full bg-stone-950 text-white shadow-md ring-2 ring-white active:scale-90"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" />
          </svg>
        </button>
      </div>
    </>
  );
}
