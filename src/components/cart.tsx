"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { CartItem } from "@/lib/types";

export type CartState = {
  chefId: number | null;
  chefName: string;
  items: CartItem[];
  source: string;
};

type CartApi = CartState & {
  add: (chefId: number, chefName: string, item: Omit<CartItem, "qty">, source?: string) => boolean;
  setQty: (dishId: number, qty: number) => void;
  clear: () => void;
  count: number;
  total: number;
};

const EMPTY: CartState = { chefId: null, chefName: "", items: [], source: "site" };
const CartCtx = createContext<CartApi | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CartState>(EMPTY);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("fw_cart");
      if (raw) setState(JSON.parse(raw));
    } catch {}
  }, []);

  const save = (next: CartState) => {
    setState(next);
    localStorage.setItem("fw_cart", JSON.stringify(next));
  };

  const add: CartApi["add"] = (chefId, chefName, item, source = "site") => {
    // Корзина привязана к одному повару: при смене повара начинаем заново
    let next = state;
    if (state.chefId !== null && state.chefId !== chefId) {
      if (!confirm(`В корзине блюда от «${state.chefName}». Очистить и добавить от «${chefName}»?`)) return false;
      next = EMPTY;
    }
    const items = [...next.items];
    const existing = items.find((i) => i.dishId === item.dishId);
    if (existing) existing.qty += 1;
    else items.push({ ...item, qty: 1 });
    save({ chefId, chefName, items, source: next.items.length === 0 ? source : next.source });
    return true;
  };

  const setQty = (dishId: number, qty: number) => {
    const items = state.items.map((i) => (i.dishId === dishId ? { ...i, qty } : i)).filter((i) => i.qty > 0);
    save(items.length === 0 ? EMPTY : { ...state, items });
  };

  const clear = () => save(EMPTY);

  const count = state.items.reduce((s, i) => s + i.qty, 0);
  const total = state.items.reduce((s, i) => s + i.qty * i.price, 0);

  return <CartCtx.Provider value={{ ...state, add, setQty, clear, count, total }}>{children}</CartCtx.Provider>;
}

export function useCart(): CartApi {
  const ctx = useContext(CartCtx);
  if (!ctx) throw new Error("useCart вне CartProvider");
  return ctx;
}
