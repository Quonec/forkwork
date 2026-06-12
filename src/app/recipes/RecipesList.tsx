"use client";

import { useState } from "react";
import type { Recipe } from "@/lib/types";
import { RecipeCardView } from "@/components/RecipeCardView";
import { SearchInput } from "@/components/SearchInput";
import { DIFFICULTY_RU } from "@/lib/format";

export default function RecipesList({ recipes }: { recipes: Recipe[] }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const filtered = needle
    ? recipes.filter((r) =>
        [r.title, r.chefName ?? "", r.tags, DIFFICULTY_RU[r.difficulty]].join(" ").toLowerCase().includes(needle)
      )
    : recipes;

  return (
    <>
      <SearchInput value={q} onChange={setQ} placeholder="Рецепт, повар или тег" />
      {filtered.length === 0 ? (
        <p className="mt-6 text-sm text-stone-500">Ничего не нашлось по запросу «{q}». Попробуйте иначе.</p>
      ) : (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {filtered.map((r) => (
            <RecipeCardView key={r.id} recipe={r} />
          ))}
        </div>
      )}
    </>
  );
}
