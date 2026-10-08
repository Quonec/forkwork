import type { Metadata } from "next";
import { listRecipes } from "@/lib/queries";
import { listEditorial } from "@/lib/recipes-editorial";
import RecipesList from "./RecipesList";

export const metadata: Metadata = { title: "Рецепты — ForkWork" };
export const dynamic = "force-dynamic";

export default function RecipesPage() {
  const recipes = listRecipes();
  const editorial = listEditorial();
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-extrabold">Рецепты</h1>
      <p className="mt-1 text-sm text-stone-500">
        Фирменные рецепты поваров платформы, а также известных шефов, поваров из топа Москвы, блюда из кино и трендовые рецепты со ссылкой на источник.
      </p>
      <RecipesList recipes={recipes} editorial={editorial} />
    </div>
  );
}
