"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { fmtFC, fmtDateTime, timeAgo } from "@/lib/format";
import { StatusChip } from "@/components/StatusChip";
import { ORDER_FLOW, ORDER_STATUS_RU, type CartItem } from "@/lib/types";

type KitchenData = {
  profile: { id: number; bio: string; specialization: string; cuisineId: number | null; lat: number | null; lng: number | null; address: string; priceLevel: number; available: number; delivery: number; pickup: number; workHours: string };
  dishes: { id: number; name: string; description: string; price: number; emoji: string; tags: string; available: number }[];
  recipes: { id: number; title: string; timeMin: number; difficulty: number; emoji: string }[];
  streams: { id: number; title: string; status: string; scheduledAt: string | null; startedAt: string | null; viewers: number; pinnedMessage: string }[];
  orders: { id: number; status: string; items: CartItem[]; total: number; fee: number; deliveryType: string; address: string; source: string; createdAt: string; customerName: string }[];
  chats: { id: number; status: string; createdAt: string; customerName: string; customerAvatar: string }[];
  reviews: { id: number; rating: number; text: string; chefReply: string; createdAt: string; authorName: string; authorAvatar: string; status: string }[];
  stats: { revenue: number; ordersCount: number; doneCount: number; avgRating: number; streamViews: number; avgCheck: number; conversion: number; fromStream: number };
};

const TABS = [
  ["overview", "Обзор"],
  ["orders", "Заказы"],
  ["dishes", "Блюда"],
  ["recipes", "Рецепты"],
  ["streams", "Стримы"],
  ["chats", "Чаты"],
  ["reviews", "Отзывы"],
  ["profile", "Профиль"],
  ["wallet", "Финансы"],
] as const;

function Kitchen() {
  const params = useSearchParams();
  const tab = params.get("tab") ?? "overview";
  const [data, setData] = useState<KitchenData | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/kitchen");
    if (res.status === 401) return (window.location.href = "/login");
    const d = await res.json();
    if (!res.ok) return setError(d.error);
    setData(d);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (body: Record<string, unknown>, okNote = "") => {
    const res = await fetch("/api/kitchen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    setNote(res.ok ? okNote : (d.error ?? "Ошибка"));
    await load();
    return res.ok;
  };

  if (error) return <div className="py-24 text-center text-stone-500">{error} · <Link className="text-orange-600" href="/cabinet">в кабинет заказчика</Link></div>;
  if (!data) return <div className="py-24 text-center text-stone-400">Открываем кухню…</div>;

  const { stats, profile } = data;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Поварской кабинет</h1>
          <p className="text-sm text-stone-500">Профиль, меню, эфиры, заказы и аналитика — всё под рукой.</p>
        </div>
        <button
          onClick={() => act({ action: "availability", available: !profile.available }, profile.available ? "Приём заказов выключен" : "Приём заказов включён")}
          className={`btn ${profile.available ? "bg-emerald-500 text-white hover:bg-emerald-600" : "bg-stone-200 text-stone-600"}`}
        >
          {profile.available ? "Принимаю заказы" : "Не принимаю заказы"}
        </button>
      </div>

      <div className="mt-6 flex gap-1 overflow-x-auto border-b border-stone-200">
        {TABS.map(([key, label]) => (
          <Link
            key={key}
            href={`/kitchen?tab=${key}`}
            className={`whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-semibold ${tab === key ? "border-orange-500 text-orange-600" : "border-transparent text-stone-500 hover:text-stone-800"}`}
          >
            {label}
            {key === "orders" && data.orders.filter((o) => o.status === "new").length > 0 && (
              <span className="ml-1.5 rounded-full bg-red-500 px-1.5 text-[10px] text-white">{data.orders.filter((o) => o.status === "new").length}</span>
            )}
            {key === "chats" && data.chats.filter((c) => c.status === "pending").length > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 text-[10px] text-white">{data.chats.filter((c) => c.status === "pending").length}</span>
            )}
          </Link>
        ))}
      </div>

      {note && <p className="mt-4 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-700">{note}</p>}

      {tab === "overview" && (
        <div className="mt-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Выручка (после комиссии)" value={fmtFC(stats.revenue)} />
            <Stat label="Заказов всего / выполнено" value={`${stats.ordersCount} / ${stats.doneCount}`} />
            <Stat label="Средний чек" value={fmtFC(stats.avgCheck)} />
            <Stat label="Рейтинг" value={`★ ${stats.avgRating}`} />
            <Stat label="Просмотров стримов" value={String(stats.streamViews)} />
            <Stat label="Заказов из стримов" value={String(stats.fromStream)} />
            <Stat label="Конверсия стрим → заказ" value={`${stats.conversion}%`} />
            <Stat label="Активных блюд" value={String(data.dishes.filter((d) => d.available).length)} />
          </div>
          <div className="card mt-4 p-5">
            <h3 className="font-bold">Подсказка дня</h3>
            <p className="mt-1 text-sm text-stone-500">
              Эфиры с закреплённой акцией дают в среднем больше заказов. Запустите стрим во вкладке «Стримы» и закрепите промо-сообщение.
            </p>
          </div>
        </div>
      )}

      {tab === "orders" && (
        <div className="mt-6 space-y-3">
          {data.orders.length === 0 && <p className="text-sm text-stone-500">Заказов пока нет.</p>}
          {data.orders.map((o) => {
            const nextIdx = ORDER_FLOW.indexOf(o.status) + 1;
            const next = o.status !== "cancelled" && nextIdx > 0 && nextIdx < ORDER_FLOW.length ? ORDER_FLOW[nextIdx] : null;
            return (
              <div key={o.id} className="card p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-display flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-base font-bold text-orange-700">
                    {(o.items[0]?.name ?? o.customerName).trim().charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">
                      #{o.id} · {o.customerName}
                      {o.source === "stream" && <span className="ml-2 chip bg-red-50 px-2 py-0.5 text-[10px] text-red-600">из стрима</span>}
                    </p>
                    <p className="truncate text-xs text-stone-500">{o.items.map((i) => `${i.name} ×${i.qty}`).join(", ")}</p>
                    <p className="text-[11px] text-stone-400">
                      {o.deliveryType === "delivery" ? `доставка: ${o.address}` : "самовывоз"} · {fmtDateTime(o.createdAt)}
                    </p>
                  </div>
                  <div className="text-right">
                    <StatusChip status={o.status} />
                    <p className="mt-1 font-extrabold">{fmtFC(o.total)}</p>
                    <p className="text-[10px] text-stone-400">вам: {fmtFC(o.total - o.fee)}</p>
                  </div>
                </div>
                {next && (
                  <div className="mt-3 flex justify-end">
                    <OrderAdvance orderId={o.id} next={next} onDone={load} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === "dishes" && <DishesTab dishes={data.dishes} act={act} />}

      {tab === "recipes" && <RecipesTab recipes={data.recipes} act={act} />}

      {tab === "streams" && <StreamsTab streams={data.streams} dishes={data.dishes} act={act} />}

      {tab === "chats" && (
        <div className="mt-6 space-y-3">
          {data.chats.length === 0 && <p className="text-sm text-stone-500">Запросов на личный чат пока нет.</p>}
          {data.chats.map((c) => (
            <div key={c.id} className="card flex items-center gap-3 p-4">
              <span className="font-display flex h-11 w-11 items-center justify-center rounded-full bg-stone-100 text-base font-bold text-stone-600">
                {c.customerName.trim().charAt(0).toUpperCase()}
              </span>
              <div className="flex-1">
                <p className="font-bold">{c.customerName}</p>
                <p className="text-xs text-stone-400">{timeAgo(c.createdAt)}</p>
              </div>
              {c.status === "pending" ? (
                <ChatDecision chatId={c.id} onDone={load} />
              ) : (
                <Link href={`/chats/${c.id}`} className="btn-secondary text-xs">
                  {c.status === "active" ? "Открыть чат" : c.status === "declined" ? "Отклонён" : "Заблокирован"}
                </Link>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "reviews" && (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {data.reviews.length === 0 && <p className="text-sm text-stone-500">Отзывов пока нет.</p>}
          {data.reviews.map((r) => (
            <div key={r.id} className={`card p-5 ${r.status === "hidden" ? "opacity-50" : ""}`}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold">{r.authorName}</p>
                <span className="text-amber-500">{"★".repeat(r.rating)}<span className="text-stone-200">{"★".repeat(5 - r.rating)}</span></span>
              </div>
              <p className="mt-2 text-sm text-stone-700">{r.text}</p>
              {r.status === "hidden" && <p className="mt-1 text-[11px] text-red-400">скрыт модерацией</p>}
              {r.chefReply ? (
                <p className="mt-2 rounded-xl bg-orange-50 p-3 text-sm"><span className="font-bold text-orange-600">Ваш ответ:</span> {r.chefReply}</p>
              ) : (
                <ReviewReply reviewId={r.id} act={act} />
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "profile" && <ProfileTab profile={profile} act={act} />}

      {tab === "wallet" && <WalletTab />}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-5">
      <p className="font-display text-xl font-bold text-stone-900">{value}</p>
      <p className="mt-1 text-xs uppercase tracking-wide text-stone-500">{label}</p>
    </div>
  );
}

function OrderAdvance({ orderId, next, onDone }: { orderId: number; next: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const advance = async () => {
    setBusy(true);
    await fetch(`/api/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setBusy(false);
    onDone();
  };
  return (
    <button onClick={advance} disabled={busy} className="btn-primary !py-1.5 text-xs">
      → {ORDER_STATUS_RU[next]}
    </button>
  );
}

function ChatDecision({ chatId, onDone }: { chatId: number; onDone: () => void }) {
  const decide = async (action: string) => {
    await fetch(`/api/chats/${chatId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    onDone();
  };
  return (
    <div className="flex gap-2">
      <button onClick={() => decide("accept")} className="btn-primary !py-1.5 text-xs">Принять</button>
      <button onClick={() => decide("decline")} className="btn-secondary !py-1.5 text-xs">Отклонить</button>
    </div>
  );
}

function ReviewReply({ reviewId, act }: { reviewId: number; act: (b: Record<string, unknown>, n?: string) => Promise<boolean> }) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  if (!open) return <button onClick={() => setOpen(true)} className="mt-2 text-xs font-semibold text-orange-600">Ответить →</button>;
  return (
    <div className="mt-2 flex gap-2">
      <input className="input !py-1.5 text-sm" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ваш ответ…" />
      <button onClick={() => act({ action: "review_reply", id: reviewId, text }, "Ответ опубликован")} className="btn-primary !py-1.5 text-xs">OK</button>
    </div>
  );
}

function DishesTab({ dishes, act }: { dishes: KitchenData["dishes"]; act: (b: Record<string, unknown>, n?: string) => Promise<boolean> }) {
  const [form, setForm] = useState({ name: "", description: "", price: 300, tags: "" });
  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-[320px_1fr]">
      <div className="card h-fit space-y-3 p-5">
        <h3 className="font-bold">Новое блюдо</h3>
        <input className="input" placeholder="Название" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <textarea className="input h-20 resize-none" placeholder="Описание" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <input type="number" className="input" placeholder="Цена FC" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} />
        <input className="input" placeholder="Теги через запятую" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
        <button
          onClick={async () => {
            if (await act({ action: "dish_add", ...form }, "Блюдо добавлено")) setForm({ name: "", description: "", price: 300, tags: "" });
          }}
          className="btn-primary w-full"
        >
          Добавить в меню
        </button>
      </div>
      <div className="space-y-3">
        {dishes.map((d) => (
          <div key={d.id} className={`card flex items-center gap-3 p-4 ${d.available ? "" : "opacity-60"}`}>
            <span className="font-display flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-lg font-bold text-orange-700">
              {d.name.trim().charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-bold">{d.name}</p>
              <p className="truncate text-xs text-stone-500">{d.description}</p>
            </div>
            <p className="font-extrabold text-orange-600">{fmtFC(d.price)}</p>
            <button onClick={() => act({ action: "dish_toggle", id: d.id })} className="btn-secondary !py-1.5 text-xs">
              {d.available ? "Скрыть" : "Вернуть"}
            </button>
            <button onClick={() => confirm("Удалить блюдо навсегда?") && act({ action: "dish_delete", id: d.id }, "Блюдо удалено")} className="btn-danger !py-1.5 text-xs">
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecipesTab({ recipes, act }: { recipes: KitchenData["recipes"]; act: (b: Record<string, unknown>, n?: string) => Promise<boolean> }) {
  const [form, setForm] = useState({ title: "", description: "", timeMin: 30, difficulty: 2, ingredients: "", steps: "", tags: "" });
  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-[360px_1fr]">
      <div className="card h-fit space-y-3 p-5">
        <h3 className="font-bold">Опубликовать рецепт</h3>
        <input className="input" placeholder="Название" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <textarea className="input h-16 resize-none" placeholder="Короткое описание" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <div className="flex gap-2">
          <input type="number" className="input" title="Время, мин" value={form.timeMin} onChange={(e) => setForm({ ...form, timeMin: Number(e.target.value) })} />
          <select className="input" value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: Number(e.target.value) })}>
            <option value={1}>Легко</option>
            <option value={2}>Средне</option>
            <option value={3}>Сложно</option>
          </select>
        </div>
        <textarea className="input h-24 resize-none" placeholder={"Ингредиенты — по одному в строке"} value={form.ingredients} onChange={(e) => setForm({ ...form, ingredients: e.target.value })} />
        <textarea className="input h-28 resize-none" placeholder={"Шаги — по одному в строке"} value={form.steps} onChange={(e) => setForm({ ...form, steps: e.target.value })} />
        <button
          onClick={async () => {
            const ok = await act(
              {
                action: "recipe_add",
                ...form,
                ingredients: form.ingredients.split("\n").map((s) => s.trim()).filter(Boolean),
                steps: form.steps.split("\n").map((s) => s.trim()).filter(Boolean),
              },
              "Рецепт опубликован"
            );
            if (ok) setForm({ title: "", description: "", timeMin: 30, difficulty: 2, ingredients: "", steps: "", tags: "" });
          }}
          className="btn-primary w-full"
        >
          Опубликовать
        </button>
      </div>
      <div className="space-y-3">
        {recipes.map((r) => (
          <div key={r.id} className="card flex items-center gap-3 p-4">
            <span className="font-display flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-sm font-bold text-orange-700">
              {r.title.trim().charAt(0).toUpperCase()}
            </span>
            <Link href={`/recipes/${r.id}`} className="flex-1 font-bold hover:text-orange-600">{r.title}</Link>
            <span className="text-xs text-stone-400">{r.timeMin} мин</span>
            <button onClick={() => confirm("Удалить рецепт?") && act({ action: "recipe_delete", id: r.id }, "Рецепт удалён")} className="btn-danger !py-1.5 text-xs">✕</button>
          </div>
        ))}
        {recipes.length === 0 && <p className="text-sm text-stone-500">Рецептов пока нет — поделитесь первым!</p>}
      </div>
    </div>
  );
}

function StreamsTab({ streams, dishes, act }: { streams: KitchenData["streams"]; dishes: KitchenData["dishes"]; act: (b: Record<string, unknown>, n?: string) => Promise<boolean> }) {
  const [title, setTitle] = useState("");
  const [pinned, setPinned] = useState("");
  const [tags, setTags] = useState("");
  const [selDishes, setSelDishes] = useState<number[]>([]);
  const [startNow, setStartNow] = useState(true);
  const [scheduledAt, setScheduledAt] = useState("");

  const toggleDish = (id: number) =>
    setSelDishes((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-[360px_1fr]">
      <div className="card h-fit space-y-3 p-5">
        <h3 className="font-bold">Новый эфир</h3>
        <input className="input" placeholder="Название эфира" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input className="input" placeholder="Закреплённое сообщение (акция?)" value={pinned} onChange={(e) => setPinned(e.target.value)} />
        <input className="input" placeholder="Теги через запятую" value={tags} onChange={(e) => setTags(e.target.value)} />
        <div>
          <p className="label">Блюда в эфире</p>
          <div className="flex flex-wrap gap-1.5">
            {dishes.filter((d) => d.available).map((d) => (
              <button key={d.id} onClick={() => toggleDish(d.id)} className={`chip ${selDishes.includes(d.id) ? "bg-orange-500 text-white" : "bg-stone-100 text-stone-600"}`}>
                {d.name}
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={startNow} onChange={(e) => setStartNow(e.target.checked)} />
          Выйти в эфир сразу
        </label>
        {!startNow && <input type="datetime-local" className="input" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />}
        <button
          onClick={async () => {
            const ok = await act(
              { action: "stream_create", title, pinnedMessage: pinned, tags, dishIds: selDishes, startNow, scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined },
              startNow ? "Вы в эфире!" : "Эфир запланирован"
            );
            if (ok) { setTitle(""); setPinned(""); setTags(""); setSelDishes([]); }
          }}
          className="btn-primary w-full"
        >
          {startNow ? "Начать эфир" : "Запланировать"}
        </button>
      </div>
      <div className="space-y-3">
        {streams.map((s) => (
          <div key={s.id} className="card p-4">
            <div className="flex items-center gap-3">
              <span className={`chip px-2 py-0.5 text-[10px] ${s.status === "live" ? "bg-red-600 text-white" : s.status === "scheduled" ? "bg-amber-100 text-amber-700" : "bg-stone-100 text-stone-500"}`}>
                {s.status === "live" ? "LIVE" : s.status === "scheduled" ? "ПЛАН" : "АРХИВ"}
              </span>
              <div className="min-w-0 flex-1">
                <Link href={`/streams/${s.id}`} className="font-bold hover:text-orange-600">{s.title}</Link>
                <p className="text-xs text-stone-400">
                  {s.status === "live" ? `в эфире · ${s.viewers} зрит.` : s.status === "scheduled" ? `запланирован: ${s.scheduledAt ? fmtDateTime(s.scheduledAt) : "—"}` : "завершён"}
                </p>
              </div>
              {s.status === "scheduled" && (
                <button onClick={() => act({ action: "stream_start", id: s.id }, "Вы в эфире!")} className="btn-primary !py-1.5 text-xs">Начать</button>
              )}
              {s.status === "live" && (
                <button onClick={() => act({ action: "stream_stop", id: s.id }, "Эфир завершён")} className="btn-danger !py-1.5 text-xs">Завершить</button>
              )}
            </div>
            {s.status === "live" && <PinEditor streamId={s.id} current={s.pinnedMessage} act={act} />}
          </div>
        ))}
        {streams.length === 0 && <p className="text-sm text-stone-500">Эфиров ещё не было. Самое время начать!</p>}
      </div>
    </div>
  );
}

function PinEditor({ streamId, current, act }: { streamId: number; current: string; act: (b: Record<string, unknown>, n?: string) => Promise<boolean> }) {
  const [text, setText] = useState(current);
  return (
    <div className="mt-3 flex gap-2">
      <input className="input !py-1.5 text-sm" value={text} onChange={(e) => setText(e.target.value)} placeholder="Закреплённое сообщение" />
      <button onClick={() => act({ action: "stream_pin", id: streamId, text }, "Закреп обновлён")} className="btn-secondary !py-1.5 text-xs">Закрепить</button>
    </div>
  );
}

function ProfileTab({ profile, act }: { profile: KitchenData["profile"]; act: (b: Record<string, unknown>, n?: string) => Promise<boolean> }) {
  const [form, setForm] = useState({ ...profile, delivery: !!profile.delivery, pickup: !!profile.pickup });
  const [cuisines, setCuisines] = useState<{ id: number; name: string; emoji: string }[]>([]);
  useEffect(() => {
    fetch("/api/chefs").then((r) => r.json()).then((d) => setCuisines(d.cuisines ?? []));
  }, []);
  return (
    <div className="card mt-6 max-w-2xl space-y-4 p-6">
      <div>
        <label className="label">О себе</label>
        <textarea className="input h-24 resize-none" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Специализация</label>
          <input className="input" value={form.specialization} onChange={(e) => setForm({ ...form, specialization: e.target.value })} />
        </div>
        <div>
          <label className="label">Кухня</label>
          <select className="input" value={form.cuisineId ?? 0} onChange={(e) => setForm({ ...form, cuisineId: Number(e.target.value) || null })}>
            <option value={0}>— не выбрана —</option>
            {cuisines.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Адрес</label>
          <input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </div>
        <div>
          <label className="label">Часы работы</label>
          <input className="input" value={form.workHours} onChange={(e) => setForm({ ...form, workHours: e.target.value })} />
        </div>
        <div>
          <label className="label">Широта (карта)</label>
          <input type="number" step="0.0001" className="input" value={form.lat ?? ""} onChange={(e) => setForm({ ...form, lat: e.target.value ? Number(e.target.value) : null })} placeholder="55.75" />
        </div>
        <div>
          <label className="label">Долгота (карта)</label>
          <input type="number" step="0.0001" className="input" value={form.lng ?? ""} onChange={(e) => setForm({ ...form, lng: e.target.value ? Number(e.target.value) : null })} placeholder="37.62" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <label className="label">Ценовой уровень</label>
          <div className="flex gap-1.5">
            {[1, 2, 3].map((p) => (
              <button key={p} onClick={() => setForm({ ...form, priceLevel: p })} className={`chip ${form.priceLevel === p ? "bg-orange-500 text-white" : "bg-stone-100 text-stone-600"}`}>
                {"₽".repeat(p)}
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.delivery} onChange={(e) => setForm({ ...form, delivery: e.target.checked })} /> Доставка</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.pickup} onChange={(e) => setForm({ ...form, pickup: e.target.checked })} /> Самовывоз</label>
      </div>
      <button onClick={() => act({ action: "profile_update", ...form }, "Профиль сохранён")} className="btn-primary">
        Сохранить профиль
      </button>
    </div>
  );
}

function WalletTab() {
  const [balance, setBalance] = useState(0);
  const [txs, setTxs] = useState<{ id: number; amount: number; comment: string; createdAt: string }[]>([]);
  useEffect(() => {
    fetch("/api/wallet").then((r) => r.json()).then((d) => {
      setBalance(d.balance ?? 0);
      setTxs(d.transactions ?? []);
    });
  }, []);
  return (
    <div className="mt-6 grid gap-4 md:grid-cols-[280px_1fr]">
      <div className="card h-fit p-6 text-center">
        <p className="text-xs font-bold uppercase tracking-wide text-stone-400">Баланс кошелька</p>
        <p className="mt-2 text-3xl font-extrabold text-orange-600">{fmtFC(balance)}</p>
        <p className="mt-2 text-[11px] text-stone-400">Доход приходит сразу после оформления заказа, за вычетом комиссии платформы 10%.</p>
      </div>
      <div className="card divide-y divide-stone-100">
        <p className="p-4 text-xs font-bold uppercase tracking-wide text-stone-400">Операции</p>
        {txs.map((t) => (
          <div key={t.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-semibold">{t.comment}</p>
              <p className="text-[11px] text-stone-400">{fmtDateTime(t.createdAt)}</p>
            </div>
            <p className={`font-extrabold ${t.amount > 0 ? "text-emerald-600" : "text-stone-700"}`}>
              {t.amount > 0 ? "+" : ""}{fmtFC(t.amount)}
            </p>
          </div>
        ))}
        {txs.length === 0 && <p className="p-4 text-sm text-stone-500">Операций пока нет.</p>}
      </div>
    </div>
  );
}

export default function KitchenPage() {
  return (
    <Suspense>
      <Kitchen />
    </Suspense>
  );
}
