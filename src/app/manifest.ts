import type { MetadataRoute } from "next";

/** Манифест веб-приложения: нужен для установки на телефон и как основа для магазинов приложений. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ForkWork — гастрономическая платформа",
    short_name: "ForkWork",
    description: "Сканер блюд с оценкой КБЖУ, карта поваров и заведений Москвы, live-стримы и рецепты.",
    lang: "ru",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#171410",
    theme_color: "#fcd000",
    categories: ["food", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    shortcuts: [
      { name: "Сканер блюда", url: "/scan", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Карта", url: "/map", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Заведения", url: "/venues", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Рецепты", url: "/recipes", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
