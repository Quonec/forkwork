import Link from "next/link";
import type { Recipe } from "@/lib/types";
import { EmojiCover } from "./ui";
import { DIFFICULTY_RU } from "@/lib/format";

export function RecipeCardView({ recipe }: { recipe: Recipe }) {
  return (
    <Link href={`/recipes/${recipe.id}`} className="card group block overflow-hidden transition-shadow hover:shadow-md">
      <EmojiCover emoji={recipe.emoji} id={recipe.id + 2} className="h-24 w-full" textSize="text-4xl" />
      <div className="p-4">
        <h3 className="font-bold leading-snug group-hover:text-orange-600">{recipe.title}</h3>
        <p className="mt-1 text-xs text-stone-500">
          {recipe.chefAvatar} {recipe.chefName}
        </p>
        <div className="mt-2.5 flex gap-1.5">
          <span className="chip bg-stone-100 text-stone-600">⏱ {recipe.timeMin} мин</span>
          <span className="chip bg-stone-100 text-stone-600">{DIFFICULTY_RU[recipe.difficulty]}</span>
        </div>
      </div>
    </Link>
  );
}
