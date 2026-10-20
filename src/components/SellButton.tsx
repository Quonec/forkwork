"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { mealAt, sellLabel } from "@/lib/meal";

/** Кнопка «Продать завтрак / обед / ужин»: подпись по часам устройства, до гидрации — «Продать блюдо». */
export default function SellButton({ className = "" }: { className?: string }) {
  const [text, setText] = useState("Продать блюдо");
  useEffect(() => {
    const tick = () => setText(sellLabel(mealAt()));
    tick();
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, []);
  return (
    <Link href="/sell" className={className}>
      {text}
    </Link>
  );
}
