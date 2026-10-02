"use client";

import { useState } from "react";

type Chef = { text: string; url: string; name?: string; role?: string; path?: string; awards?: string[] };

const host = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/**
 * Ряд кнопок «О кухне» и «Повара» в карточке заведения: открыта одна из двух
 * вкладок. Если сведений о поварах нет (у заведений из общей базы), кнопки нет.
 */
export default function KitchenTabs({
  cuisine,
  facts,
  chefs,
  compact = false,
}: {
  cuisine?: string;
  facts: string[];
  /** undefined — вкладки «Повара» у этого заведения нет вовсе; пустой список — вкладка есть, но сведений не нашлось. */
  chefs?: Chef[];
  compact?: boolean;
}) {
  const [tab, setTab] = useState<"kitchen" | "chefs">("kitchen");
  const hasChefs = chefs !== undefined;
  const size = compact ? "text-xs" : "text-sm";
  return (
    <div className="mt-3">
      <div role="tablist" className="flex gap-1.5">
        <button
          role="tab"
          type="button"
          aria-selected={tab === "kitchen"}
          onClick={() => setTab("kitchen")}
          className={`rounded-full border px-3 py-1.5 text-xs font-bold ${tab === "kitchen" ? "border-stone-950 bg-stone-950 text-yellow-300" : "border-stone-200 bg-white text-stone-600"}`}
        >
          О кухне
        </button>
        {hasChefs && (
          <button
            role="tab"
            type="button"
            aria-selected={tab === "chefs"}
            onClick={() => setTab("chefs")}
            className={`rounded-full border px-3 py-1.5 text-xs font-bold ${tab === "chefs" ? "border-stone-950 bg-stone-950 text-yellow-300" : "border-stone-200 bg-white text-stone-600"}`}
          >
            Повара{chefs.length > 0 ? ` · ${chefs.length}` : ""}
          </button>
        )}
      </div>

      {tab === "kitchen" && (
        <div role="tabpanel" className="mt-2">
          {cuisine && <p className={`${size} font-semibold text-stone-800`}>{cuisine}</p>}
          <ul className={`mt-1 list-disc space-y-1 pl-5 ${size} text-stone-700`}>
            {facts.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      {tab === "chefs" && hasChefs && (
        <div role="tabpanel" className="mt-2">
          {chefs.length === 0 ? (
            <p className={`${size} text-stone-500`}>О поварах этого заведения в открытых источниках сведений не нашлось. Состав кухни смотрите на сайте заведения.</p>
          ) : (
            <>
              <ul className={`space-y-2 ${size} text-stone-700`}>
                {chefs.map((c) => {
                  const rich = !!(c.path || c.awards?.length);
                  return (
                    <li key={c.text} className="rounded-lg bg-orange-50 p-2.5">
                      {c.name && (
                        <p className="font-bold text-stone-900">
                          {c.name}
                          {c.role && <span className="font-medium text-stone-500"> · {c.role}</span>}
                        </p>
                      )}
                      {rich ? (
                        <>
                          {c.path && (
                            <p className="mt-1">
                              <span className="text-[11px] font-bold uppercase tracking-wide text-orange-700">Гастропуть</span>
                              <br />
                              {c.path}
                            </p>
                          )}
                          {c.awards && c.awards.length > 0 && (
                            <div className="mt-1">
                              <span className="text-[11px] font-bold uppercase tracking-wide text-orange-700">Достижения</span>
                              <ul className="list-disc space-y-0.5 pl-5">
                                {c.awards.map((x) => (
                                  <li key={x}>{x}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </>
                      ) : (
                        <p className={c.name ? "mt-1" : ""}>{c.text}</p>
                      )}
                      <a href={c.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block whitespace-nowrap text-xs font-semibold text-orange-700 underline">
                        источник · {host(c.url)}
                      </a>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-1 text-[11px] text-stone-400">Составы кухонь меняются, в источниках бывают расхождения: актуальное на сайте заведения.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
