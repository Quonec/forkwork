import type { Metadata } from "next";
import { listRecipes } from "@/lib/queries";
import { RecipeCardView } from "@/components/RecipeCardView";

export const metadata: Metadata = { title: "Рецепты — ForkWork" };
export const dynamic = "force-dynamic";

export default function RecipesPage() {
  const recipes = listRecipes();
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-extrabold">Рецепты от поваров</h1>
      <p className="mt-1 text-sm text-stone-500">Фирменные рецепты с пошаговыми инструкциями — готовьте вместе со стримами.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {recipes.map((r) => (
          <RecipeCardView key={r.id} recipe={r} />
        ))}
      </div>
    </div>
  );
}
