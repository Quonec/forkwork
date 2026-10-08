"use client";

import type { Dish } from "@/lib/types";
import { useCart } from "@/components/cart";
import { fmtFC } from "@/lib/format";

export default function DishList({
  dishes,
  chefId,
  chefName,
  available,
}: {
  dishes: Dish[];
  chefId: number;
  chefName: string;
  available: boolean;
}) {
  const cart = useCart();

  if (dishes.length === 0) return <p className="text-sm text-stone-500">Повар ещё не добавил блюда.</p>;

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {dishes.map((d) => {
        const inCart = cart.chefId === chefId ? cart.items.find((i) => i.dishId === d.id) : undefined;
        return (
          <div key={d.id} className="card flex items-center gap-4 p-4">
            <span className="font-display flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-2xl text-stone-950/40">
              {d.name.trim().charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="font-bold leading-tight">{d.name}</h3>
              <p className="mt-0.5 line-clamp-2 text-xs text-stone-500">{d.description}</p>
              <p className="mt-1.5 font-extrabold text-orange-600">{fmtFC(d.price)}</p>
            </div>
            <div className="shrink-0">
              {!available ? (
                <span className="text-xs text-stone-400">недоступно</span>
              ) : inCart ? (
                <div className="flex items-center gap-2">
                  <button onClick={() => cart.setQty(d.id, inCart.qty - 1)} className="btn-secondary !h-9 !w-9 !p-0">−</button>
                  <span className="w-5 text-center text-sm font-bold">{inCart.qty}</span>
                  <button onClick={() => cart.setQty(d.id, inCart.qty + 1)} className="btn-primary !h-9 !w-9 !p-0">+</button>
                </div>
              ) : (
                <button
                  onClick={() => cart.add(chefId, chefName, { dishId: d.id, name: d.name, price: d.price, emoji: d.emoji }, "site")}
                  className="btn-primary !py-2.5 text-xs"
                >
                  В корзину
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
