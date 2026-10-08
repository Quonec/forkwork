import Link from "next/link";
import { listChefs, listStreams, listRecipes, siteTotals, weeklyAdditions } from "@/lib/queries";
import { ChefCardView } from "@/components/ChefCardView";
import { StreamCardView } from "@/components/StreamCardView";
import { RecipeCardView } from "@/components/RecipeCardView";
import { SectionTitle, LiveBadge } from "@/components/ui";
import HeroBubbles from "@/components/HeroBubbles";
import HomeDrawer, { DrawerBlock, type Peek } from "@/components/HomeDrawer";
import RouteBook, { type RouteStage } from "@/components/RouteBook";

export const dynamic = "force-dynamic";

/** Маршрут ForkWork: три стадии-вкладки как страницы книги, у каждой инструкция и ссылки в нужные разделы. */
const STAGES: RouteStage[] = [
  {
    num: "01",
    title: "Отсканируйте блюдо",
    steps: [
      "Нажмите большую кнопку внизу экрана (на компьютере «Скан» в меню).",
      "Сфотографируйте блюдо: сервис приблизительно определит блюдо и КБЖУ.",
      "Войдите, чтобы результат попал в историю и дневник недели. Гостю доступен один скан.",
    ],
    links: [
      { href: "/scan", label: "К сканеру", note: "сфотографировать блюдо" },
      { href: "/scan/diary", label: "Дневник", note: "недельная сводка калорий и БЖУ" },
      { href: "/legal/scan", label: "Правила", note: "как обрабатываются фото и данные" },
    ],
  },
  {
    num: "02",
    title: "Найдите, где поесть",
    steps: [
      "Откройте карту: повара рядом и заведения из топа Москвы во вкладке «Избранное».",
      "Отфильтруйте по близости, тематике и цене во вкладках над картой.",
      "Откройте карточку: оценки 2ГИС и Яндекс Карт рядом, кухня, повара и ссылка на меню.",
    ],
    links: [
      { href: "/map", label: "К карте", note: "повара рядом и заведения Москвы" },
      { href: "/venues", label: "Заведения", note: "оценки, кухня, повара, отзывы" },
    ],
  },
  {
    num: "03",
    title: "Закажите или приготовьте",
    steps: [
      "Выберите повара или эфир и добавьте блюдо в корзину.",
      "Оплатите кошельком ForkCoins (1 FC = 1 ₽) и следите за статусом заказа.",
      "Или повторите дома рецепт шефа: у каждого есть автор и источник.",
    ],
    links: [
      { href: "/chefs", label: "Повара", note: "каталог поваров с рейтингом" },
      { href: "/streams", label: "Эфиры", note: "смотреть и заказывать из стрима" },
      { href: "/recipes", label: "Рецепты", note: "повара, шефы, кино и тренды" },
    ],
  },
];

/** Склонение по числу: 1 отзыв, 2 отзыва, 5 отзывов. */
const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10;
  const m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
};

export default function Home() {
  const chefs = listChefs().slice(0, 4);
  const streams = listStreams().filter((s) => s.status !== "ended").slice(0, 3);
  const liveCount = streams.filter((s) => s.status === "live").length;
  const recipes = listRecipes().slice(0, 4);
  const week = weeklyAdditions();
  const totals = siteTotals();

  // Превью по одному элементу из каждого раздела: выпадают под полосой при наведении на счётчик
  const s0 = streams[0];
  const c0 = chefs[0];
  const r0 = recipes[0];
  const peekCard = "block rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200/70 transition hover:bg-yellow-50";
  const previews: { streams: Peek | null; chefs: Peek | null; recipes: Peek | null } = {
    streams: s0
      ? {
          href: "/streams",
          cta: "Все стримы",
          node: (
            <Link href={`/streams/${s0.id}`} className={peekCard}>
              <span className="flex items-center gap-2">
                {s0.status === "live" ? <LiveBadge small /> : <span className="chip bg-stone-200 text-[10px] text-stone-600">скоро</span>}
                <span className="text-xs text-stone-500">{s0.chefName}</span>
              </span>
              <span className="mt-1 block text-sm font-bold leading-snug">{s0.title}</span>
              {s0.status === "live" && <span className="mt-0.5 block text-xs text-stone-500">{s0.viewers} {plural(s0.viewers, "зритель", "зрителя", "зрителей")}</span>}
            </Link>
          ),
        }
      : null,
    chefs: c0
      ? {
          href: "/chefs",
          cta: "Все повара",
          node: (
            <Link href={`/chefs/${c0.id}`} className={peekCard}>
              <span className="block text-sm font-bold leading-snug">{c0.name}</span>
              <span className="mt-0.5 block text-xs text-stone-500">
                ★ {c0.rating.toFixed(1)} · {c0.reviewsCount} {plural(c0.reviewsCount, "отзыв", "отзыва", "отзывов")}{c0.cuisineName ? ` · ${c0.cuisineName}` : ""}
              </span>
              <span className="mt-0.5 block text-xs text-stone-500">{c0.available ? "принимает заказы" : "сейчас не принимает заказы"}</span>
            </Link>
          ),
        }
      : null,
    recipes: r0
      ? {
          href: "/recipes",
          cta: "Все рецепты",
          node: (
            <Link href={`/recipes/${r0.id}`} className={peekCard}>
              <span className="block text-sm font-bold leading-snug">{r0.title}</span>
              <span className="mt-0.5 block text-xs text-stone-500">
                {r0.chefName} · {r0.timeMin} мин
              </span>
            </Link>
          ),
        }
      : null,
  };

  return (
    <div>
      {/* Хиро */}
      <section className="relative isolate overflow-hidden bg-stone-950 text-white">
        <HeroBubbles />
        <div className="relative z-10 mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 md:grid-cols-2 md:py-24">
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
                ...(totals.chefs > 0 ? [[String(totals.chefs), "поваров на платформе"]] : []),
                ...(totals.dishes > 0 ? [[String(totals.dishes), "блюд в меню"]] : []),
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

      {/* Сейчас в эфире, повара недели и свежие рецепты: свёрнуты в шторку со счётчиками пополнений */}
      <HomeDrawer live={liveCount} chefsNew={week.chefs} recipesNew={week.recipes} previews={previews}>
        <DrawerBlock title="Сейчас в эфире" subtitle="Подключайтесь к открытому чату и заказывайте из стрима" href="/streams" linkText="Все стримы" badge={`+${week.streams} за неделю`}>
          {streams.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-3">
              {streams.map((x) => (
                <StreamCardView key={x.id} stream={x} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-stone-500">Сейчас эфиров нет, ближайшие смотрите в разделе «Стримы».</p>
          )}
        </DrawerBlock>
        <DrawerBlock title="Лучшие повара недели" subtitle="Рейтинг считается по отзывам реальных заказов" href="/chefs" linkText="Все повара" badge={`+${week.chefs} за неделю`}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {chefs.map((c) => (
              <ChefCardView key={c.id} chef={c} />
            ))}
          </div>
        </DrawerBlock>
        <DrawerBlock title="Свежие рецепты" subtitle="Повара делятся фирменными секретами" href="/recipes" linkText="Все рецепты" badge={`+${week.recipes} за неделю`}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {recipes.map((r) => (
              <RecipeCardView key={r.id} recipe={r} />
            ))}
          </div>
        </DrawerBlock>
      </HomeDrawer>

      {/* Маршрут ForkWork: три планки-жалюзи */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 " aria-label="Маршрут ForkWork">
        <SectionTitle title="Маршрут ForkWork" subtitle="Три стадии от голода до сытого вечера: наведите или коснитесь планки, чтобы раскрыть стадию" />
        <RouteBook stages={STAGES} />
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
