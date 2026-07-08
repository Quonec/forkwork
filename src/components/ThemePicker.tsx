"use client";

import { useEffect, useRef, useState } from "react";

// Переключатель цветовой палитры: меняет data-theme на <html>,
// выбор сохраняется в localStorage (применяется до гидрации скриптом в layout)

const THEMES: { id: string; label: string; swatch: string }[] = [
  { id: "", label: "Охра", swatch: "#c9822f" },
  { id: "emerald", label: "Изумруд", swatch: "#17a673" },
  { id: "berry", label: "Ягода", swatch: "#c2436b" },
  { id: "ocean", label: "Океан", swatch: "#2f6fb0" },
];

export default function ThemePicker() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme ?? "");
  }, []);

  // Закрытие по клику вне меню
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const apply = (id: string) => {
    setTheme(id);
    setOpen(false);
    if (id) document.documentElement.dataset.theme = id;
    else delete document.documentElement.dataset.theme;
    try {
      localStorage.setItem("fw-theme", id);
    } catch {}
  };

  const current = THEMES.find((t) => t.id === theme) ?? THEMES[0];

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Цветовая палитра"
        className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-stone-100"
      >
        <span
          className="h-4.5 w-4.5 rounded-full ring-2 ring-white"
          style={{ background: `conic-gradient(${current.swatch} 0 50%, #171410 50% 100%)`, width: 18, height: 18 }}
        />
      </button>
      {open && (
        <div className="card absolute right-0 top-11 z-[1150] w-44 overflow-hidden p-1.5">
          <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-stone-400">Палитра</p>
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => apply(t.id)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${theme === t.id ? "bg-stone-100 font-bold" : "hover:bg-stone-50"}`}
            >
              <span className="h-3.5 w-3.5 rounded-full" style={{ background: t.swatch }} />
              {t.label}
              {theme === t.id && <span className="ml-auto text-xs text-stone-400">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
