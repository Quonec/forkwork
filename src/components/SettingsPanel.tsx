"use client";

import { DAY_FROM, DAY_TO, DEFAULT_PREFS, resolveTheme, savePrefs, usePrefs, type Prefs } from "@/lib/prefs";
import { useState } from "react";

const ACCENTS: { id: Prefs["accent"]; label: string; color: string }[] = [
  { id: "ochre", label: "Охра", color: "#fcd000" },
  { id: "green", label: "Лайм", color: "#8bd450" },
  { id: "blue", label: "Небо", color: "#6ec1f5" },
  { id: "rose", label: "Роза", color: "#ff9db5" },
];

/** Компактный переключатель: сегменты в одной плашке. */
function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-full bg-stone-100 p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${value === o.id ? "bg-yellow-400 text-stone-950" : "text-stone-600 hover:text-stone-900"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Строка: название слева, управление справа; на узком экране управление уходит под название. */
function Row({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        {note && <p className="text-[11px] leading-snug text-stone-500">{note}</p>}
      </div>
      {children}
    </div>
  );
}

const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="card px-4 pb-1 pt-3">
    <h2 className="text-[10px] font-bold uppercase tracking-widest text-orange-700">{title}</h2>
    <div className="divide-y divide-stone-200/60">{children}</div>
  </section>
);

/** Подсказки хранятся отдельными флагами: сброс возвращает их, как при первом заходе. */
function resetHints() {
  try {
    const drop: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (k === "fw-scan-hint" || k === "fw-fan-hint" || k.startsWith("fw-tip:")) drop.push(k);
    }
    drop.forEach((k) => localStorage.removeItem(k));
  } catch {}
}

export default function SettingsPanel() {
  const p = usePrefs();
  const [done, setDone] = useState("");
  const set = (patch: Partial<Prefs>) => savePrefs({ ...p, ...patch });
  const now = resolveTheme(p.theme);
  const flash = (t: string) => {
    setDone(t);
    setTimeout(() => setDone(""), 2500);
  };

  return (
    <div className="mt-4 space-y-3">
      <Group title="Оформление">
        <Row title="Тема" note={p.theme === "auto" ? `Сейчас ${now === "light" ? "светлая" : "тёмная"}: светлая ${DAY_FROM}:00–${DAY_TO}:00` : undefined}>
          <Seg
            label="Тема"
            value={p.theme}
            onChange={(theme) => set({ theme })}
            options={[
              { id: "auto", label: "Авто" },
              { id: "light", label: "Светлая" },
              { id: "dark", label: "Тёмная" },
            ]}
          />
        </Row>
        <Row title="Акцент">
          <div role="radiogroup" aria-label="Цвет акцента" className="flex gap-2">
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                type="button"
                role="radio"
                aria-checked={p.accent === a.id}
                aria-label={a.label}
                title={a.label}
                onClick={() => set({ accent: a.id })}
                className={`h-7 w-7 rounded-full ring-offset-2 ring-offset-white ${p.accent === a.id ? "ring-2 ring-stone-950" : "ring-1 ring-stone-300"}`}
                style={{ background: a.color }}
              />
            ))}
          </div>
        </Row>
        <Row title="Текст">
          <Seg label="Размер текста" value={p.text} onChange={(text) => set({ text })} options={[{ id: "normal", label: "Обычный" }, { id: "large", label: "Крупный" }]} />
        </Row>
        <Row title="Анимации">
          <Seg label="Движение" value={p.motion} onChange={(motion) => set({ motion })} options={[{ id: "full", label: "Есть" }, { id: "reduced", label: "Меньше" }]} />
        </Row>
      </Group>

      <Group title="Нижняя панель (телефон)">
        <Row title="Подписи">
          <Seg label="Подписи" value={p.labels ? "on" : "off"} onChange={(v) => set({ labels: v === "on" })} options={[{ id: "on", label: "Есть" }, { id: "off", label: "Нет" }]} />
        </Row>
        <Row title="Кнопка «Ещё»" note="Веер раскрывается под вашу руку">
          <Seg label="Рука" value={p.hand} onChange={(hand) => set({ hand })} options={[{ id: "right", label: "Правая" }, { id: "left", label: "Левая" }]} />
        </Row>
      </Group>

      <Group title="Приложение">
        <Row title="Подсказки" note="Вернуть, как при первом заходе">
          <button type="button" className="btn-secondary !px-3 !py-1 !text-xs" onClick={() => { resetHints(); flash("Подсказки вернутся при следующем заходе"); }}>
            Показать снова
          </button>
        </Row>
        <Row title="Круги заставки" note="Ползунки в уголке главной">
          <button type="button" className="btn-secondary !px-3 !py-1 !text-xs" onClick={() => { try { localStorage.removeItem("fw-bubbles-hero"); } catch {} flash("Круги вернулись к стандарту"); }}>
            Сбросить
          </button>
        </Row>
        <Row title="Всё по умолчанию">
          <button type="button" className="btn-danger !px-3 !py-1 !text-xs" onClick={() => { savePrefs(DEFAULT_PREFS); resetHints(); flash("Настройки сброшены"); }}>
            Сбросить всё
          </button>
        </Row>
      </Group>
      <p role="status" className="min-h-4 text-center text-xs font-semibold text-orange-700">{done}</p>
    </div>
  );
}
