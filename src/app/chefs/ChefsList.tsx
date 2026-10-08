"use client";

import { useState } from "react";
import type { ChefCard } from "@/lib/types";
import { ChefCardView } from "@/components/ChefCardView";
import { SearchInput } from "@/components/SearchInput";

export default function ChefsList({ chefs }: { chefs: ChefCard[] }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const filtered = needle
    ? chefs.filter((c) =>
        [c.name, c.cuisineName ?? "", c.specialization, c.address].join(" ").toLowerCase().includes(needle)
      )
    : chefs;

  return (
    <>
      <SearchInput value={q} onChange={setQ} placeholder="Повар, кухня или специализация" />
      {filtered.length === 0 ? (
        <p className="mt-6 text-sm text-stone-500">Никого не нашлось по запросу «{q}». Попробуйте иначе.</p>
      ) : (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {filtered.map((c) => (
            <ChefCardView key={c.id} chef={c} />
          ))}
        </div>
      )}
    </>
  );
}
