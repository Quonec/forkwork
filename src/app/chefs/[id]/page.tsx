import { notFound } from "next/navigation";
import Link from "next/link";
import { getChef, listDishes, listChefReviews, listRecipes } from "@/lib/queries";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Stars, LiveBadge, Monogram } from "@/components/ui";
import { RecipeCardView } from "@/components/RecipeCardView";
import { PRICE_LEVELS, fmtDate, plural } from "@/lib/format";
import DishList from "./DishList";
import ChefActions from "./ChefActions";

export const dynamic = "force-dynamic";

export default async function ChefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const chef = getChef(Number(id));
  if (!chef) notFound();

  const user = await getSessionUser();
  const dishes = listDishes(chef.id);
  const reviews = listChefReviews(chef.id);
  const recipes = listRecipes().filter((r) => r.chefId === chef.id);
  const isFavorite = user
    ? !!db.prepare("SELECT 1 FROM favorites WHERE user_id = ? AND chef_id = ?").get(user.id, chef.id)
    : false;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Шапка профиля */}
      <div className="card overflow-hidden">
        <Monogram label={chef.name} id={chef.id} className="h-36 w-full" textSize="text-7xl" />
        <div className="flex flex-col gap-4 p-6 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-extrabold">{chef.name}</h1>
              {chef.liveStreamId && (
                <Link href={`/streams/${chef.liveStreamId}`}>
                  <LiveBadge />
                </Link>
              )}
              {chef.available ? (
                <span className="chip bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200">Принимает заказы</span>
              ) : (
                <span className="chip bg-stone-100 text-stone-500">Сейчас не принимает</span>
              )}
            </div>
            <p className="mt-1 text-sm text-stone-500">
              {chef.cuisineName} · {chef.specialization} · {PRICE_LEVELS[chef.priceLevel]}
            </p>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-stone-600">{chef.bio}</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-stone-500">
              <Stars rating={chef.rating} />
              <span>
                {chef.reviewsCount} {plural(chef.reviewsCount, "отзыв", "отзыва", "отзывов")}
              </span>
              <span>{chef.address}</span>
              <span>{chef.workHours}</span>
              <span>{[chef.delivery ? "доставка" : "", chef.pickup ? "самовывоз" : ""].filter(Boolean).join(" · ")}</span>
            </div>
          </div>
          <ChefActions chefId={chef.id} chefName={chef.name} initialFavorite={isFavorite} loggedIn={!!user} liveStreamId={chef.liveStreamId} />
        </div>
      </div>

      {/* Меню */}
      <section className="mt-8">
        <h2 className="mb-4 text-xl font-bold">Меню · {dishes.length} {plural(dishes.length, "блюдо", "блюда", "блюд")}</h2>
        <DishList dishes={dishes} chefId={chef.id} chefName={chef.name} available={!!chef.available} />
      </section>

      {/* Рецепты */}
      {recipes.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 text-xl font-bold">Рецепты повара</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {recipes.map((r) => (
              <RecipeCardView key={r.id} recipe={r} />
            ))}
          </div>
        </section>
      )}

      {/* Отзывы */}
      <section className="mt-10">
        <h2 className="mb-4 text-xl font-bold">
          Отзывы · {reviews.length}
        </h2>
        {reviews.length === 0 ? (
          <p className="text-sm text-stone-500">Пока нет отзывов. Отзыв можно оставить после выполненного заказа.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {reviews.map((r) => (
              <div key={r.id} className="card p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-display flex h-8 w-8 items-center justify-center rounded-full bg-stone-100 text-sm font-bold text-stone-600">
                      {r.authorName.trim().charAt(0).toUpperCase()}
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{r.authorName}</p>
                      <p className="text-[11px] text-stone-400">{fmtDate(r.createdAt)}</p>
                    </div>
                  </div>
                  <Stars rating={r.rating} size="text-xs" />
                </div>
                <p className="mt-3 text-sm text-stone-700">{r.text}</p>
                {r.chefReply && (
                  <div className="mt-3 rounded-xl bg-orange-50 p-3 text-sm">
                    <p className="text-xs font-bold text-orange-600">Ответ повара</p>
                    <p className="mt-1 text-stone-700">{r.chefReply}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
