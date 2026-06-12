"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "./cart";
import { fmtFC, plural } from "@/lib/format";

export default function CartBar() {
  const { count, total, chefName } = useCart();
  const pathname = usePathname();

  if (count === 0 || pathname === "/cart" || pathname.startsWith("/orders")) return null;

  return (
    <div className="fixed inset-x-4 bottom-16 z-[1140] md:bottom-5 md:left-auto md:right-24 md:w-96">
      <Link
        href="/cart"
        className="flex items-center justify-between gap-3 rounded-lg bg-stone-950 px-4 py-3 text-white shadow-lg shadow-stone-950/25 transition-colors hover:bg-stone-800"
      >
        <span className="min-w-0">
          <span className="block text-sm font-bold">
            {count} {plural(count, "позиция", "позиции", "позиций")} · {fmtFC(total)}
          </span>
          <span className="block truncate text-[11px] text-stone-300">{chefName}</span>
        </span>
        <span className="shrink-0 rounded-lg bg-yellow-400 px-3 py-1.5 text-xs font-bold text-stone-950">Оформить</span>
      </Link>
    </div>
  );
}
