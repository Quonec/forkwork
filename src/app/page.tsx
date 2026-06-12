import Link from "next/link";
import { listChefs, listStreams, listRecipes } from "@/lib/queries";
import { ChefCardView } from "@/components/ChefCardView";
import { StreamCardView } from "@/components/StreamCardView";
import { RecipeCardView } from "@/components/RecipeCardView";
import { SectionTitle, LiveBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function Home() {
  const chefs = listChefs().slice(0, 4);
  const streams = listStreams().filter((s) => s.status !== "ended").slice(0, 3);
  const liveCount = streams.filter((s) => s.status === "live").length;
  const recipes = listRecipes().slice(0, 4);

  return (
    <div>
      {/* Хиро */}
      <section className="relative overflow-hidden bg-stone-950 text-white">
        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 md:grid-cols-2 md:py-24">
          <div>
            <span className="chip bg-white/10 uppercase tracking-widest text-orange-200">
              Foodtech-платформа поваров и горожан
            </span>
            <h1 className="font-display mt-5 text-4xl leading-tight sm:text-6xl">
              Город готовит <span className="text-orange-400">вживую</span>
            </h1>
            <p className="mt-4 max-w-md text-lg text-stone-300">
              Находите поваров на карте, смотрите стримы с кухонь, заказывайте блюда из эфира и общайтесь напрямую — всё в одном месте.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/map" className="btn bg-white px-6 py-3 text-stone-950 hover:bg-stone-100">
                Открыть карту
              </Link>
              <Link href="/streams" className="btn bg-white/10 px-6 py-3 text-white ring-1 ring-white/25 hover:bg-white/20">
                <span className="live-dot inline-block h-2 w-2 rounded-full bg-red-500" />
                {liveCount > 0 ? `${liveCount} эфир${liveCount === 1 ? "" : "а"} сейчас` : "Стримы"}
              </Link>
            </div>
            <div className="mt-10 grid grid-cols-3 gap-4 text-center sm:max-w-sm">
              {[
                ["8+", "поваров рядом"],
                ["30+", "блюд в меню"],
                ["10%", "комиссия платформы"],
              ].map(([n, label]) => (
                <div key={label} className="rounded-xl bg-white/5 px-2 py-3 ring-1 ring-white/10">
                  <div className="font-display text-xl text-orange-300">{n}</div>
                  <div className="text-[11px] text-stone-400">{label}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="hidden items-center justify-center md:flex">
            <div className="relative">
              <div className="font-display flex h-72 w-72 items-center justify-center rounded-full bg-white/5 text-[120px] text-orange-300/70 ring-1 ring-white/10">
                FW
              </div>
              <div className="absolute -left-8 top-8 rounded-xl bg-white px-4 py-3 text-stone-900 shadow-xl">
                <LiveBadge small /> <span className="ml-1 text-sm font-semibold">Карбонара вживую</span>
              </div>
              <div className="absolute -right-6 bottom-10 rounded-xl bg-white px-4 py-3 text-stone-900 shadow-xl">
                <span className="text-sm font-semibold">★ 4.9 · Нино Геловани</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Как это работает */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <SectionTitle title="Как работает ForkWork" subtitle="Три шага от голода до горячего блюда" />
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ["01", "Найдите повара", "Интерактивная карта с фильтрами по кухне, цене, рейтингу и live-статусу."],
            ["02", "Смотрите эфир", "Повар готовит в прямом эфире: чат, реакции и заказ блюда прямо из стрима."],
            ["03", "Получите заказ", "Оплата кошельком ForkCoins, статус заказа в реальном времени, отзыв после."],
          ].map(([num, title, text]) => (
            <div key={title} className="card p-6">
              <div className="font-display text-3xl text-orange-500">{num}</div>
              <h3 className="mt-3 font-bold">{title}</h3>
              <p className="mt-1.5 text-sm text-stone-500">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Стримы */}
      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <SectionTitle title="Сейчас в эфире" subtitle="Подключайтесь к открытому чату и заказывайте из стрима" href="/streams" linkText="Все стримы" />
        <div className="grid gap-4 md:grid-cols-3">
          {streams.map((s) => (
            <StreamCardView key={s.id} stream={s} />
          ))}
        </div>
      </section>

      {/* Повара */}
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <SectionTitle title="Лучшие повара недели" subtitle="Рейтинг считается по отзывам реальных заказов" href="/chefs" linkText="Все повара" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {chefs.map((c) => (
            <ChefCardView key={c.id} chef={c} />
          ))}
        </div>
      </section>

      {/* Рецепты */}
      <section className="mx-auto max-w-7xl px-4 py-6 pb-10 sm:px-6">
        <SectionTitle title="Свежие рецепты" subtitle="Повара делятся фирменными секретами" href="/recipes" linkText="Все рецепты" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {recipes.map((r) => (
            <RecipeCardView key={r.id} recipe={r} />
          ))}
        </div>
      </section>

      {/* CTA для поваров */}
      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
        <div className="card flex flex-col items-center gap-4 bg-stone-950 p-10 text-center text-white ring-0 md:flex-row md:justify-between md:text-left">
          <div>
            <h3 className="font-display text-2xl">Готовите так, что соседи занимают очередь?</h3>
            <p className="mt-1 text-stone-300">Станьте поваром ForkWork: стримы, заказы и монетизация ваших рецептов.</p>
          </div>
          <Link href="/register?role=chef" className="btn shrink-0 bg-white px-6 py-3 text-stone-950 hover:bg-stone-100">
            Стать поваром
          </Link>
        </div>
      </section>
    </div>
  );
}
