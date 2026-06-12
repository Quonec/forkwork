"use client";

import Link from "next/link";
import { useCart } from "./cart";

export default function CartBadge() {
  const { count } = useCart();
  return (
    <Link
      href="/cart"
      className="relative flex h-10 w-10 items-center justify-center rounded-lg text-stone-700 hover:bg-stone-100"
      title="Корзина"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="20" r="1.4" />
        <circle cx="17" cy="20" r="1.4" />
        <path d="M3 4h2.2l2.4 11.2a1.6 1.6 0 0 0 1.6 1.3h7.9a1.6 1.6 0 0 0 1.6-1.3L20.5 8H6.1" />
      </svg>
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 px-1 text-[11px] font-bold text-white">
          {count}
        </span>
      )}
    </Link>
  );
}
