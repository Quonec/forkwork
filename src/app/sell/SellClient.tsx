"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import ListingCard, { type ListingView } from "@/components/ListingCard";
import { MEALS, mealAt, type Meal } from "@/lib/meal";

const EMPTY = { title: "", description: "", price: 300 };

export default function SellClient({ signedIn }: { signedIn: boolean }) {
  const [form, setForm] = useState(EMPTY);
  const [meal, setMeal] = useState<Meal>("lunch");
  const [photo, setPhoto] = useState<File | null>(null);
  const [video, setVideo] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [listings, setListings] = useState<ListingView[]>([]);
  const [fileKey, setFileKey] = useState(0);

  // Приём пищи по часам устройства — после гидрации.
  useEffect(() => setMeal(mealAt()), []);
  useEffect(() => {
    if (!photo) return setPreview(null);
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const load = useCallback(async () => {
    const r = await fetch("/api/listings");
    if (r.ok) setListings((await r.json()).listings);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNote("");
    if (!photo) return setError("Добавьте фото блюда");
    const fd = new FormData();
    fd.set("title", form.title);
    fd.set("description", form.description);
    fd.set("price", String(form.price));
    fd.set("meal", meal);
    fd.set("photo", photo);
    if (video) fd.set("video", video);
    setBusy(true);
    const r = await fetch("/api/listings", { method: "POST", body: fd }).catch(() => null);
    setBusy(false);
    if (!r) return setError("Нет связи с сервером");
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setError(d.error ?? (r.status === 413 ? "Файлы слишком большие" : "Не получилось выставить блюдо"));
    setForm(EMPTY);
    setPhoto(null);
    setVideo(null);
    setFileKey((k) => k + 1);
    setNote("Блюдо выставлено");
    load();
  };

  const remove = async (id: string) => {
    const r = await fetch(`/api/listings/${id}`, { method: "DELETE" });
    if (r.ok) load();
  };

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[360px_1fr]">
      {signedIn ? (
        <form onSubmit={submit} className="card h-fit space-y-3 p-5" aria-label="Новое блюдо на продажу">
          <h2 className="font-bold">Новая плитка</h2>
          <div role="radiogroup" aria-label="Приём пищи" className="flex rounded-full bg-stone-100 p-0.5">
            {MEALS.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={meal === m.id}
                onClick={() => setMeal(m.id)}
                className={`flex-1 rounded-full px-2 py-1 text-xs font-semibold ${meal === m.id ? "bg-yellow-400 text-stone-950" : "text-stone-600"}`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <input
            className="input"
            placeholder="Что продаёте, например «Плов с бараниной»"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
            minLength={2}
            maxLength={80}
          />
          <textarea
            className="input h-20 resize-none"
            placeholder="Порция, состав, когда можно забрать"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            maxLength={400}
          />
          <label className="block">
            <span className="label">Цена, FC</span>
            <input type="number" min={10} max={100000} className="input" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} />
          </label>
          <label className="block">
            <span className="label">Фото блюда (до 8 МБ)</span>
            <input
              key={`p${fileKey}`}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="block w-full text-xs"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            />
          </label>
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Предпросмотр фото" className="aspect-[4/3] w-full rounded-xl object-cover" />
          )}
          <label className="block">
            <span className="label">Видео, по желанию (до 40 МБ)</span>
            <input
              key={`v${fileKey}`}
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              className="block w-full text-xs"
              onChange={(e) => setVideo(e.target.files?.[0] ?? null)}
            />
          </label>
          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          {note && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{note}</p>}
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? "Загружаем…" : "Выставить на продажу"}
          </button>
          <p className="text-[11px] text-stone-400">Фото и видео видны всем. Покупку и оплату через ForkWork подключим следующим шагом.</p>
        </form>
      ) : (
        <div className="card h-fit space-y-3 p-5">
          <h2 className="font-bold">Войдите, чтобы продать блюдо</h2>
          <p className="text-sm text-stone-500">Продавать может любой пользователь ForkWork: добавьте фото и видео, назначьте цену.</p>
          <div className="flex gap-2">
            <Link href="/login?next=/sell" className="btn-primary flex-1">
              Войти
            </Link>
            <Link href="/register" className="btn-secondary flex-1">
              Регистрация
            </Link>
          </div>
        </div>
      )}

      <section aria-label="Сейчас продают">
        <h2 className="font-bold">Сейчас продают</h2>
        {listings.length === 0 ? (
          <p className="mt-2 text-sm text-stone-500">Пока никто не выставил блюдо. Будьте первым!</p>
        ) : (
          <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {listings.map((l) => (
              <ListingCard key={l.id} l={l} onDelete={remove} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
