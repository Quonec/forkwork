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
            <span className="chip bg-white/10 uppercase tracking-widest text-yellow-300">
              Гастрономическое путешествие по городу
            </span>
            <h1 className="font-display mt-5 text-4xl leading-tight sm:text-6xl">
              Город готовит <span className="text-yellow-400">вживую</span>
            </h1>
            <p className="mt-4 max-w-md text-lg text-stone-300">
              Постройте маршрут до ближайшей кухни: повара на карте, стримы в прямом эфире, заказ — и блюдо уже едет к вам.
            </p>

            {/* Маршрутная форма, как в такси: откуда → куда */}
            <Link href="/map" className="mt-8 block max-w-md rounded-2xl bg-white p-2.5 text-stone-950 shadow-xl">
              <span className="flex items-center gap-3 px-3 py-2.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-yellow-400 ring-4 ring-yellow-400/25" />
                <span className="text-sm text-stone-500">Вы: дома, проголодались</span>
              </span>
              <span className="ml-[1.45rem] block h-4 w-px bg-stone-300" />
              <span className="flex items-center gap-3 rounded-xl bg-stone-100 px-3 py-3">
                <span className="h-2.5 w-2.5 shrink-0 rounded-[3px] bg-stone-950" />
                <span className="text-sm font-bold">Куда отправимся за вкусом?</span>
                <span className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-yellow-400 font-bold">→</span>
              </span>
            </Link>

            <div className="mt-4 flex flex-wrap gap-3">
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
                  <div className="font-display text-xl text-yellow-300">{n}</div>
                  <div className="text-[11px] text-stone-400">{label}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="hidden items-center justify-center md:flex">
            <div className="relative">
              <div className="font-display flex h-72 w-72 items-center justify-center rounded-full bg-white/5 text-[120px] text-yellow-300/70 ring-1 ring-white/10">
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
        <SectionTitle title="Маршрут ForkWork" subtitle="Три остановки от голода до горячего блюда" />
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ["01", "Найдите повара", "Интерактивная карта с фильтрами по кухне, цене, рейтингу и live-статусу.", false],
            ["02", "Смотрите эфир", "Повар готовит в прямом эфире: чат, реакции и заказ блюда прямо из стрима.", false],
            ["03", "Получите заказ", "Оплата кошельком ForkCoins, статус заказа в реальном времени, отзыв после.", true],
          ].map(([num, title, text, last]) => (
            <div key={title as string} className="card relative overflow-hidden p-6">
              <div className="flex items-center gap-3">
                {last ? (
                  <span className="h-3 w-3 shrink-0 rounded-[3px] bg-stone-950" />
                ) : (
                  <span className="h-3 w-3 shrink-0 rounded-full bg-yellow-400 ring-4 ring-yellow-400/25" />
                )}
                <span className="h-px flex-1 border-t-2 border-dashed border-stone-200" />
                <span className="font-display text-3xl text-stone-300">{num}</span>
              </div>
              <h3 className="mt-4 font-bold">{title}</h3>
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
          <Link href="/register?role=chef" className="btn shrink-0 bg-yellow-400 px-6 py-3 text-stone-950 hover:bg-yellow-300">
            Стать поваром
          </Link>
        </div>
      </section>
    </div>
  );
}
