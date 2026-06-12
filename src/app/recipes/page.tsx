import type { Metadata } from "next";
import { listRecipes } from "@/lib/queries";
import RecipesList from "./RecipesList";

export const metadata: Metadata = { title: "Рецепты — ForkWork" };
export const dynamic = "force-dynamic";

export default function RecipesPage() {
  const recipes = listRecipes();
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-extrabold">Рецепты от поваров</h1>
      <p className="mt-1 text-sm text-stone-500">Фирменные рецепты с пошаговыми инструкциями — готовьте вместе со стримами.</p>
      <RecipesList recipes={recipes} />
    </div>
  );
}
