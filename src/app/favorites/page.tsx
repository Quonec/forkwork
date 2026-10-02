"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { ChefCardView } from "@/components/ChefCardView";
import { Empty } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import type { ChefCard } from "@/lib/types";

type Note = { id: string; text: string; createdAt: string; updatedAt: string };

const TABS = [
  ["favorites", "Любимое"],
  ["notes", "Заметки"],
] as const;

function Favorites() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = params.get("tab") === "notes" ? "notes" : "favorites";

  const [chefs, setChefs] = useState<ChefCard[]>([]);
  const [favIds, setFavIds] = useState<number[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [notes, setNotes] = useState<Note[]>([]);
  const [draft, setDraft] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const guard = useCallback((r: Response) => {
    if (r.status === 401) {
      window.location.href = "/login";
      throw new Error("unauthorized");
    }
    return r;
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/favorites").then(guard).then((r) => r.json()),
      fetch("/api/chefs").then((r) => r.json()),
      fetch("/api/notes").then(guard).then((r) => r.json()),
    ])
      .then(([f, c, n]) => {
        setFavIds(f.chefIds ?? []);
        setChefs(c.chefs ?? []);
        setNotes(n.notes ?? []);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [guard]);

  const favorites = chefs.filter((c) => favIds.includes(c.id));

  const removeFavorite = async (chefId: number) => {
    const r = await fetch("/api/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chefId }),
    });
    if (r.ok) setFavIds((ids) => ids.filter((id) => id !== chefId));
  };

  const addNote = async () => {
    setError(null);
    const r = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: draft }),
    });
    const d = await r.json();
    if (!r.ok) return setError(d.error ?? "Не получилось сохранить заметку");
    setNotes((n) => [d.note, ...n]);
    setDraft("");
  };

  const saveEdit = async () => {
    if (!editId) return;
    setError(null);
    const r = await fetch(`/api/notes/${editId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: editText }),
    });
    const d = await r.json();
    if (!r.ok) return setError(d.error ?? "Не получилось сохранить заметку");
    setNotes((n) => [d.note, ...n.filter((x) => x.id !== editId)]);
    setEditId(null);
  };

  const removeNote = async (id: string) => {
    const r = await fetch(`/api/notes/${id}`, { method: "DELETE" });
    if (r.ok) setNotes((n) => n.filter((x) => x.id !== id));
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <h1 className="font-display text-2xl tracking-tight">Любимое</h1>

      <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl bg-stone-100 p-1" role="tablist">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => router.replace(key === "favorites" ? "/favorites" : `/favorites?tab=${key}`)}
            className={`rounded-lg py-2 text-sm font-semibold transition-colors ${
              tab === key ? "bg-white text-stone-950 shadow-sm" : "text-stone-500"
            }`}
          >
            {label}
            <span className="ml-1.5 text-xs text-stone-400">{key === "favorites" ? favorites.length : notes.length}</span>
          </button>
        ))}
      </div>

      {tab === "favorites" && (
        <section className="mt-5">
          {loaded && favorites.length === 0 ? (
            <Empty text="Пока пусто. Добавляйте поваров в избранное на их страницах.">
              <Link href="/chefs" className="btn-primary">
                К поварам
              </Link>
            </Empty>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {favorites.map((c) => (
                <div key={c.id} className="relative">
                  <ChefCardView chef={c} />
                  <button
                    onClick={() => removeFavorite(c.id)}
                    aria-label={`Убрать из любимого: ${c.name}`}
                    className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-red-500 shadow"
                  >
                    ♥
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === "notes" && (
        <section className="mt-5">
          <div className="card p-4">
            <label htmlFor="new-note" className="label">
              Новая заметка
            </label>
            <textarea
              id="new-note"
              className="input min-h-24 resize-y"
              maxLength={2000}
              placeholder="Что хочется попробовать, заметки о поварах и блюдах…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-xs text-stone-400">{draft.length}/2000</span>
              <button className="btn-primary disabled:opacity-50" disabled={draft.trim().length === 0} onClick={addNote}>
                Добавить
              </button>
            </div>
          </div>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

          {loaded && notes.length === 0 ? (
            <div className="mt-4">
              <Empty text="Заметок пока нет." />
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {notes.map((n) => (
                <li key={n.id} className="card p-4">
                  {editId === n.id ? (
                    <>
                      <textarea className="input min-h-24 resize-y" maxLength={2000} value={editText} onChange={(e) => setEditText(e.target.value)} />
                      <div className="mt-2 flex justify-end gap-2">
                        <button className="btn-secondary" onClick={() => setEditId(null)}>
                          Отмена
                        </button>
                        <button className="btn-primary disabled:opacity-50" disabled={editText.trim().length === 0} onClick={saveEdit}>
                          Сохранить
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="whitespace-pre-wrap text-sm">{n.text}</p>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <span className="text-xs text-stone-400">{fmtDateTime(n.updatedAt)}</span>
                        <span className="flex gap-3 text-sm font-semibold">
                          <button
                            className="text-stone-600 hover:text-stone-950"
                            onClick={() => {
                              setEditId(n.id);
                              setEditText(n.text);
                            }}
                          >
                            Изменить
                          </button>
                          <button className="text-red-600 hover:text-red-700" onClick={() => removeNote(n.id)}>
                            Удалить
                          </button>
                        </span>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

export default function FavoritesPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-3xl px-4 py-10 text-center text-sm text-stone-500">Загрузка…</div>}>
      <Favorites />
    </Suspense>
  );
}
