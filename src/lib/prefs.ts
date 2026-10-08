"use client";

import { useSyncExternalStore } from "react";

/**
 * Настройки приложения, они хранятся на устройстве (гостю вход не нужен).
 * Применяются как data-атрибуты на <html>, а оформление задано в globals.css.
 */
export type Prefs = {
  /** auto — светлая днём и тёмная вечером и ночью по часам устройства */
  theme: "auto" | "light" | "dark";
  accent: "ochre" | "green" | "blue" | "rose";
  /** подписи под значками нижней панели */
  labels: boolean;
  /** с какой стороны угловая кнопка «Ещё» (под большой палец) */
  hand: "right" | "left";
  text: "normal" | "large";
  motion: "full" | "reduced";
};

export const PREFS_KEY = "fw-prefs";
export const PREFS_EVENT = "fw:prefs";
export const DEFAULT_PREFS: Prefs = { theme: "auto", accent: "ochre", labels: true, hand: "right", text: "normal", motion: "full" };

/** Часы, в которые автотема светлая: с 7:00 до 20:00 по времени устройства. */
export const DAY_FROM = 7;
export const DAY_TO = 20;

export function resolveTheme(theme: Prefs["theme"], date = new Date()): "light" | "dark" {
  if (theme !== "auto") return theme;
  const h = date.getHours();
  return h >= DAY_FROM && h < DAY_TO ? "light" : "dark";
}

export function parsePrefs(raw: string | null): Prefs {
  try {
    const j = JSON.parse(raw ?? "null");
    if (!j || typeof j !== "object") return DEFAULT_PREFS;
    const pick = <T extends string>(v: unknown, all: readonly T[], d: T): T => (all.includes(v as T) ? (v as T) : d);
    return {
      theme: pick(j.theme, ["auto", "light", "dark"], "auto"),
      accent: pick(j.accent, ["ochre", "green", "blue", "rose"], "ochre"),
      labels: j.labels !== false,
      hand: pick(j.hand, ["right", "left"], "right"),
      text: pick(j.text, ["normal", "large"], "normal"),
      motion: pick(j.motion, ["full", "reduced"], "full"),
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function readPrefs(): Prefs {
  try {
    return parsePrefs(localStorage.getItem(PREFS_KEY));
  } catch {
    return DEFAULT_PREFS;
  }
}

const THEME_COLOR = { light: "#fcd000", dark: "#14110c" };

/** Ставит атрибуты на <html>; цвет строки браузера подстраивается под тему. */
export function applyPrefs(p: Prefs) {
  const el = document.documentElement;
  const theme = resolveTheme(p.theme);
  el.dataset.theme = theme;
  el.dataset.accent = p.accent;
  el.dataset.labels = p.labels ? "on" : "off";
  el.dataset.hand = p.hand;
  el.dataset.text = p.text;
  el.dataset.motion = p.motion;
  el.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[theme]);
}

export function savePrefs(next: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  } catch {}
  applyPrefs(next);
  window.dispatchEvent(new Event(PREFS_EVENT));
}

// Снимок кэшируется по строке, чтобы useSyncExternalStore не получал каждый раз новый объект.
let cacheRaw: string | null | undefined;
let cacheVal: Prefs = DEFAULT_PREFS;
function snapshot(): Prefs {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(PREFS_KEY);
  } catch {}
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    cacheVal = parsePrefs(raw);
  }
  return cacheVal;
}
function subscribe(cb: () => void) {
  window.addEventListener(PREFS_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(PREFS_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** Текущие настройки; на сервере и при гидрации — значения по умолчанию. */
export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribe, snapshot, () => DEFAULT_PREFS);
}

/** Однострочный скрипт для <head>: ставит тему до первой отрисовки, без вспышки светлого экрана. */
export const PREFS_BOOT_SCRIPT = `(function(){try{var p=JSON.parse(localStorage.getItem(${JSON.stringify(PREFS_KEY)})||"null")||{};var h=new Date().getHours();var t=p.theme==="light"||p.theme==="dark"?p.theme:(h>=${DAY_FROM}&&h<${DAY_TO}?"light":"dark");var e=document.documentElement;e.dataset.theme=t;e.style.colorScheme=t;e.dataset.accent=p.accent||"ochre";e.dataset.labels=p.labels===false?"off":"on";e.dataset.hand=p.hand==="left"?"left":"right";e.dataset.text=p.text==="large"?"large":"normal";e.dataset.motion=p.motion==="reduced"?"reduced":"full"}catch(_){}})();`;
