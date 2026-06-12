"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "./cart";

const ITEMS: { href: string; label: string; icon: (active: boolean) => React.ReactNode }[] = [
  {
    href: "/",
    label: "Главная",
    icon: (a) => (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={a ? 2.4 : 2}>
        <path d="M3 10.5 12 3l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 9.5V21h14V9.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/map",
    label: "Карта",
    icon: (a) => (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={a ? 2.4 : 2}>
        <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" strokeLinejoin="round" />
        <circle cx="12" cy="10" r="2.5" />
      </svg>
    ),
  },
  {
    href: "/streams",
    label: "Стримы",
    icon: (a) => (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={a ? 2.4 : 2}>
        <rect x="3" y="5" width="18" height="14" rx="2.5" />
        <path d="m10.5 9.5 4 2.5-4 2.5v-5Z" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/cart",
    label: "Корзина",
    icon: (a) => (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={a ? 2.4 : 2}>
        <circle cx="9" cy="20" r="1.4" />
        <circle cx="17" cy="20" r="1.4" />
        <path d="M3 4h2.2l2.4 11.2a1.6 1.6 0 0 0 1.6 1.3h7.9a1.6 1.6 0 0 0 1.6-1.3L20.5 8H6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/cabinet",
    label: "Кабинет",
    icon: (a) => (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={a ? 2.4 : 2}>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20c.8-3.5 3.6-5.5 7-5.5s6.2 2 7 5.5" strokeLinecap="round" />
      </svg>
    ),
  },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { count } = useCart();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-[1150] border-t border-stone-200 bg-white md:hidden">
      <div className="grid grid-cols-5">
        {ITEMS.map((it) => {
          const active = it.href === "/" ? pathname === "/" : pathname.startsWith(it.href);
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
              {it.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
