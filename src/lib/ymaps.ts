// Общий загрузчик Яндекс.Карт: скрипт подгружается один раз на всё приложение
// (карта поваров, выбор локации в кабинете и т.д.)

const API_KEY = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY ?? "";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    ymaps?: any;
  }
}

let loaderPromise: Promise<any> | null = null;

export function loadYmaps(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.ymaps?.Map) return Promise.resolve(window.ymaps);
  if (!loaderPromise) {
    loaderPromise = new Promise((resolve, reject) => {
      const ready = () => window.ymaps.ready(() => resolve(window.ymaps));
      const existing = document.getElementById("ymaps-script") as HTMLScriptElement | null;
      if (existing) {
        existing.addEventListener("load", ready);
        existing.addEventListener("error", reject);
        return;
      }
      const s = document.createElement("script");
      s.id = "ymaps-script";
      s.async = true;
      s.src = `https://api-maps.yandex.ru/2.1/?lang=ru_RU${API_KEY ? `&apikey=${API_KEY}` : ""}`;
      s.onload = ready;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  return loaderPromise;
}
