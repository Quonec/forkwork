"use client";

import { useState } from "react";
import Link from "next/link";
import type { Recipe } from "@/lib/types";
import type { EditorialCategory, EditorialRecipe } from "@/lib/recipes-editorial";
import { RecipeCardView } from "@/components/RecipeCardView";
import { SearchInput } from "@/components/SearchInput";
import { Monogram } from "@/components/ui";
import { DIFFICULTY_RU } from "@/lib/format";

// Подписи рубрик дублируются здесь: модуль recipes-editorial читает файлы и работает только на сервере.
const GROUPS: { id: "all" | "platform" | EditorialCategory; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "platform", label: "От поваров платформы" },
  { id: "famous", label: "Известные повара" },
  { id: "top", label: "Повара из топа Москвы" },
  { id: "media", label: "Из кино и игр" },
  { id: "trend", label: "Трендовые" },
];

export default function RecipesList({ recipes, editorial }: { recipes: Recipe[]; editorial: EditorialRecipe[] }) {
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<(typeof GROUPS)[number]["id"]>("all");
  const needle = q.trim().toLowerCase();

  const platform = group === "all" || group === "platform" ? recipes : [];
  const edit = group === "all" ? editorial : group === "platform" ? [] : editorial.filter((e) => e.category === group);

  const platformFiltered = needle
    ? platform.filter((r) => [r.title, r.chefName ?? "", r.tags, DIFFICULTY_RU[r.difficulty]].join(" ").toLowerCase().includes(needle))
    : platform;
  const editFiltered = needle
    ? edit.filter((r) => [r.title, r.author, r.tags, r.from ?? ""].join(" ").toLowerCase().includes(needle))
    : edit;
  const total = platformFiltered.length + editFiltered.length;

  const count = (id: (typeof GROUPS)[number]["id"]) =>
    id === "all" ? recipes.length + editorial.length : id === "platform" ? recipes.length : editorial.filter((e) => e.category === id).length;

  return (
    <>
      <SearchInput value={q} onChange={setQ} placeholder="Рецепт, повар или тег" />
      <div role="tablist" className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
        {GROUPS.map((g) => (
          <button
            key={g.id}
            role="tab"
            type="button"
            aria-selected={group === g.id}
            onClick={() => setGroup(g.id)}
            className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-bold ${group === g.id ? "border-stone-950 bg-stone-950 text-yellow-300" : "border-stone-200 bg-white text-stone-600"}`}
          >
            {g.label} · {count(g.id)}
          </button>
        ))}
      </div>
      {total === 0 ? (
        <p className="mt-6 text-sm text-stone-500">
          {needle ? `Ничего не нашлось по запросу «${q}». Попробуйте иначе.` : "В этой рубрике пока нет рецептов."}
        </p>
      ) : (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {platformFiltered.map((r) => (
            <RecipeCardView key={r.id} recipe={r} />
          ))}
          {editFiltered.map((r, i) => (
            <Link key={r.slug} href={`/recipes/e/${r.slug}`} className="card group block overflow-hidden transition hover:ring-stone-400">
              <Monogram label={r.title} id={i + 5} className="h-24 w-full" textSize="text-4xl" />
              <div className="p-4">
                <h3 className="font-bold leading-snug group-hover:text-orange-600">{r.title}</h3>
                <p className="mt-1 text-xs text-stone-500">{r.author}</p>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {r.timeMin !== null && <span className="chip bg-stone-100 text-stone-600">{r.timeMin} мин</span>}
                  <span className="chip bg-stone-100 text-stone-600">{DIFFICULTY_RU[r.difficulty]}</span>
                  <span className="chip bg-orange-50 text-orange-700">{GROUPS.find((g) => g.id === r.category)?.label}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
