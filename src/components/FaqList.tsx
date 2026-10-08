import Link from "next/link";
import { FAQ } from "@/lib/faq";

/** Вопросы и ответы по разделам: группы раскрываются отдельно, внутри каждый вопрос тоже. Без скриптов (details). */
export default function FaqList({ open = false }: { open?: boolean }) {
  return (
    <div className="grid gap-x-8 gap-y-6 md:grid-cols-2">
      {FAQ.map((g) => (
        <section key={g.id} id={`faq-${g.id}`} className="min-w-0">
          <h3 className="mb-2 flex items-baseline justify-between gap-3 text-sm font-bold text-stone-800">
            <span>{g.title}</span>
            <Link href={g.href} className="shrink-0 text-xs font-semibold text-orange-700 hover:underline">
              Открыть раздел →
            </Link>
          </h3>
          <div className="divide-y divide-stone-100 rounded-xl border border-stone-200/80">
            {g.items.map((it) => (
              <details key={it.q} open={open} className="group/q px-3 py-2.5">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-3 text-sm font-semibold text-stone-800 [&::-webkit-details-marker]:hidden">
                  <span>{it.q}</span>
                  <span aria-hidden="true" className="mt-0.5 shrink-0 text-stone-400 transition-transform group-open/q:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-1.5 text-sm leading-relaxed text-stone-600">{it.a}</p>
              </details>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
