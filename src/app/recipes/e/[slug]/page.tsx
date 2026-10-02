import { notFound } from "next/navigation";
import Link from "next/link";
import { getEditorial, editorialLabel } from "@/lib/recipes-editorial";
import { Monogram } from "@/components/ui";
import { DIFFICULTY_RU } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function EditorialRecipePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = getEditorial(slug);
  if (!r) notFound();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Link href="/recipes" className="text-sm text-stone-500 hover:text-stone-800">
        ← Все рецепты
      </Link>
      <div className="card mt-3 overflow-hidden">
        <Monogram label={r.title} id={r.slug.length} className="h-40 w-full" textSize="text-7xl" />
        <div className="p-6">
          <div className="flex flex-wrap gap-2">
            <span className="chip bg-orange-50 text-orange-700">{editorialLabel(r.category)}</span>
            {r.timeMin !== null && <span className="chip bg-stone-100 text-stone-600">{r.timeMin} мин</span>}
            <span className="chip bg-stone-100 text-stone-600" title="Оценка ForkWork, не источника">
              Сложность: {DIFFICULTY_RU[r.difficulty]}
            </span>
            {r.servings && <span className="chip bg-stone-100 text-stone-600">{r.servings}</span>}
            {r.tags.split(",").filter(Boolean).map((t) => (
              <span key={t} className="chip bg-orange-50 text-orange-600">#{t.trim()}</span>
            ))}
          </div>
          <h1 className="mt-3 text-3xl font-extrabold">{r.title}</h1>
          <p className="mt-2 text-stone-600">{r.description}</p>

          <div className="mt-4 rounded-xl bg-stone-50 px-4 py-3 text-sm">
            <p className="font-bold">{r.author}</p>
            {r.authorNote && <p className="text-xs text-stone-500">{r.authorNote}</p>}
            {r.from && <p className="mt-1 text-xs text-stone-500">Из: {r.from}</p>}
            {r.venueId && (
              <Link href={`/venues#v-${r.venueId}`} className="mt-1 inline-block text-xs font-semibold text-orange-700 underline">
                Ресторан в топе Москвы
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-[280px_1fr]">
        <div className="card h-fit p-5">
          <h2 className="font-bold">Ингредиенты</h2>
          <ul className="mt-3 space-y-2">
            {r.ingredients.map((ing, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-stone-700">
                <span className="mt-0.5 text-orange-500">•</span> {ing}
              </li>
            ))}
          </ul>
        </div>
        <div className="card p-5">
          <h2 className="font-bold">Приготовление</h2>
          {r.steps.length > 0 ? (
            <ol className="mt-3 space-y-4">
              {r.steps.map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-extrabold text-orange-600">{i + 1}</span>
                  <p className="text-sm leading-relaxed text-stone-700">{step}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-3 text-sm text-stone-600">Шаги приготовления в источнике: откройте ссылку ниже.</p>
          )}
        </div>
      </div>

      <div className="card mt-6 p-5 text-sm text-stone-600">
        {r.note && <p className="mb-2">{r.note}</p>}
        <p>
          Источник:{" "}
          <a href={r.source.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-orange-700 underline">
            {r.source.name}
          </a>
          , прочитано 2026-10-02. Рецепт пересказан своими словами, состав и пропорции взяты со страницы источника; единицы в скобках пересчитаны приблизительно. Права на рецепт и текст принадлежат автору и источнику.
        </p>
      </div>
    </div>
  );
}
