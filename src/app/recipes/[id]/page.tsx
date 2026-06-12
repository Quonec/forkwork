import { notFound } from "next/navigation";
import Link from "next/link";
import { getRecipe, getChef } from "@/lib/queries";
import { EmojiCover, Stars } from "@/components/ui";
import { DIFFICULTY_RU } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recipe = getRecipe(Number(id));
  if (!recipe) notFound();
  const chef = getChef(recipe.chefId);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="card overflow-hidden">
        <EmojiCover emoji={recipe.emoji} id={recipe.id + 2} className="h-40 w-full" textSize="text-7xl" />
        <div className="p-6">
          <div className="flex flex-wrap gap-2">
            <span className="chip bg-stone-100 text-stone-600">⏱ {recipe.timeMin} мин</span>
            <span className="chip bg-stone-100 text-stone-600">Сложность: {DIFFICULTY_RU[recipe.difficulty]}</span>
            {recipe.tags.split(",").filter(Boolean).map((t) => (
              <span key={t} className="chip bg-orange-50 text-orange-600">#{t.trim()}</span>
            ))}
          </div>
          <h1 className="mt-3 text-3xl font-extrabold">{recipe.title}</h1>
          <p className="mt-2 text-stone-600">{recipe.description}</p>

          {chef && (
            <Link href={`/chefs/${chef.id}`} className="mt-4 flex w-fit items-center gap-3 rounded-2xl bg-stone-50 px-4 py-3 transition-colors hover:bg-orange-50">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-xl ring-1 ring-stone-200">{chef.avatar}</span>
              <span>
                <span className="block text-sm font-bold">{chef.name}</span>
                <Stars rating={chef.rating} size="text-xs" />
              </span>
            </Link>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-[280px_1fr]">
        <div className="card h-fit p-5">
          <h2 className="font-bold">Ингредиенты</h2>
          <ul className="mt-3 space-y-2">
            {recipe.ingredients.map((ing, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-stone-700">
                <span className="mt-0.5 text-orange-500">•</span> {ing}
              </li>
            ))}
          </ul>
        </div>
        <div className="card p-5">
          <h2 className="font-bold">Приготовление</h2>
          <ol className="mt-3 space-y-4">
            {recipe.steps.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-extrabold text-orange-600">
                  {i + 1}
                </span>
                <p className="text-sm leading-relaxed text-stone-700">{step}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
