"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import type { ScanView } from "@/lib/scan/events";
import { fmtTotal, gFromMg, scanDateTime } from "@/lib/scan/format";
import { Stranded } from "@/components/ui";

type SimilarDish = { id: number; name: string; price: number; emoji: string; chefId: number; chefName: string };

const STEP = 10;
const MIN = 10;
const MAX = 2000;

export default function ScanResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [scan, setScan] = useState<ScanView | null>(null);
  const [missing, setMissing] = useState(false);
  const [photoBroken, setPhotoBroken] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const [similar, setSimilar] = useState<SimilarDish[]>([]);
  const [guest, setGuest] = useState(false);

  useEffect(() => {
    fetch("/api/scans/consent")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { guest?: boolean } | null) => setGuest(!!d?.guest))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    fetch(`/api/scans/${id}/similar`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { similar: SimilarDish[] } | null) => d && setSimilar(d.similar))
      .catch(() => undefined);
  }, [id]);

  useEffect(() => {
    fetch(`/api/scans/${id}`).then(async (r) => {
      if (r.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!r.ok) return setMissing(true);
      const d = (await r.json()) as { scan: ScanView };
      if (d.scan.status !== "done") return setMissing(true);
      setScan(d.scan);
    });
  }, [id]);

  const setGrams = useCallback(
    async (itemId: string, grams: number) => {
      const next = Math.min(MAX, Math.max(MIN, grams));
      setSaveError(false);
      const r = await fetch(`/api/scans/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, grams: next }),
      });
      if (!r.ok) return setSaveError(true);
      setScan(((await r.json()) as { scan: ScanView }).scan);
    },
    [id],
  );

  const remove = async () => {
    setDeleteError(false);
    const r = await fetch(`/api/scans/${id}`, { method: "DELETE" });
    if (!r.ok) return setDeleteError(true);
    router.push("/scan/history");
  };

  if (missing) return <Stranded title="Скан не найден" hint="Возможно, он удалён или принадлежит другому аккаунту." />;
  if (!scan) return <div className="mx-auto max-w-md px-4 py-10 text-center text-sm text-stone-500">Загрузка…</div>;

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <Link href="/scan" className="text-sm font-semibold text-orange-600">
        ← К сканеру
      </Link>
      <h1 className="font-display mt-3 text-xl tracking-tight">Скан · {scanDateTime(scan.createdAt)}</h1>

      {scan.photo.available && !photoBroken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/scans/${id}/photo`}
          alt="Фото блюда"
          className="mt-4 aspect-[4/3] w-full rounded-2xl object-cover ring-2 ring-orange-300"
          onError={() => setPhotoBroken(true)}
        />
      ) : (
        <p className="card mt-4 p-4 text-sm text-stone-500">
          {photoBroken ? "Фото не загрузилось" : "Фото удалено через 30 дней — оценка сохранена"}
        </p>
      )}

      {guest && (
        <div className="card mt-4 border-l-4 border-orange-400 bg-orange-50 p-4">
          <p className="font-semibold">Это ваш бесплатный гостевой скан</p>
          <p className="mt-0.5 text-sm text-stone-600">
            Зарегистрируйтесь, чтобы он остался в истории и дневнике и чтобы сканировать дальше.
          </p>
          <div className="mt-3 flex gap-2">
            <Link href="/register" className="btn-primary">
              Регистрация
            </Link>
            <Link href="/login?next=/scan" className="btn-secondary">
              Войти
            </Link>
          </div>
        </div>
      )}

      <p className="mt-4 text-xs text-stone-500">
        <span className="chip bg-orange-100 text-orange-800">Оценка по фото</span> Это не данные повара — видите только вы.
      </p>

      <h2 className="mt-5 text-sm font-bold uppercase tracking-wide text-orange-700">На тарелке</h2>
      <ul className="mt-2 space-y-3">
        {scan.items.map((it) => (
          <li key={it.id} className="card border-l-4 border-orange-400 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{it.name}</p>
                <p className="text-xs text-orange-700">{it.source === "reference" ? "по справочнику" : "оценка нейросети"}</p>
              </div>
              <p className="text-right font-bold">≈{it.perPortion.kcal} ккал</p>
            </div>
            <p className="mt-1 text-xs text-stone-500">
              Б {gFromMg(it.perPortion.proteinMg)} · Ж {gFromMg(it.perPortion.fatMg)} · У {gFromMg(it.perPortion.carbsMg)} · на 100 г:{" "}
              {it.per100g.kcal} ккал
            </p>
            <div className="mt-3 flex items-center gap-3" role="group" aria-label={`Граммы: ${it.name}`}>
              <button
                className="btn-secondary h-9 w-9 !p-0 disabled:opacity-40"
                aria-label="Убавить 10 г"
                disabled={it.grams <= MIN}
                onClick={() => setGrams(it.id, it.grams - STEP)}
              >
                −
              </button>
              <span className="min-w-16 text-center font-semibold">≈{it.grams} г</span>
              <button
                className="btn-secondary h-9 w-9 !p-0 disabled:opacity-40"
                aria-label="Прибавить 10 г"
                disabled={it.grams >= MAX}
                onClick={() => setGrams(it.id, it.grams + STEP)}
              >
                +
              </button>
            </div>
          </li>
        ))}
      </ul>
      {saveError && <p className="mt-2 text-sm text-red-600">Не получилось сохранить граммы — попробуйте ещё раз</p>}

      <div className="card mt-4 bg-orange-950 p-4 text-orange-50">
        <p className="text-xs uppercase tracking-wide text-orange-300">Итого · {scan.total.grams} г</p>
        <p className="mt-1 font-bold text-orange-200">{fmtTotal(scan.total)}</p>
      </div>

      <Link href="/venues#assistant" className="card mt-3 flex items-center justify-between gap-3 border-l-4 border-orange-400 p-3 hover:bg-orange-50">
        <span>
          <span className="block font-semibold">Спросить помощника</span>
          <span className="text-xs text-stone-500">Где поесть похожее и что в меню подходит под ваш дневник</span>
        </span>
        <span className="text-stone-400">›</span>
      </Link>

      {similar.length > 0 && (
        <section className="mt-6" aria-labelledby="scan-similar">
          <h2 id="scan-similar" className="font-display text-lg tracking-tight">
            Похожее готовят у нас
          </h2>
          <ul className="mt-2 space-y-2">
            {similar.map((d) => (
              <li key={d.id}>
                <Link href={`/chefs/${d.chefId}`} className="card flex items-center gap-3 p-3 hover:bg-orange-50">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-100 text-2xl">{d.emoji || "🍽"}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{d.name}</span>
                    <span className="text-xs text-stone-500">
                      {d.chefName} · {d.price.toLocaleString("ru-RU")} FC
                    </span>
                  </span>
                  <span className="text-stone-400">›</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-6">
        {!confirmDelete ? (
          <button className="btn-ghost text-red-600" onClick={() => setConfirmDelete(true)}>
            Удалить скан
          </button>
        ) : (
          <div className="card border-red-200 p-4">
            <p className="font-semibold">Удалить этот скан?</p>
            <p className="text-sm text-stone-500">Фото и оценку не вернуть.</p>
            {deleteError && <p className="mt-2 text-sm text-red-600">Не получилось удалить скан — попробуйте ещё раз</p>}
            <div className="mt-3 flex gap-2">
              <button className="btn-secondary flex-1" onClick={() => setConfirmDelete(false)}>
                Оставить
              </button>
              <button className="btn-danger flex-1" onClick={remove}>
                Удалить
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
