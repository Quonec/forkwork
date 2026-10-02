import type { MetadataRoute } from "next";
import { listEditorial } from "@/lib/recipes-editorial";

export const dynamic = "force-dynamic";

/** Карта сайта: публичные страницы и внешние рецепты. Адрес сайта задаётся NEXT_PUBLIC_SITE_URL. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3010").replace(/\/$/, "");
  const now = new Date();
  const pages: [string, number][] = [
    ["/", 1],
    ["/scan", 0.9],
    ["/map", 0.9],
    ["/venues", 0.9],
    ["/recipes", 0.7],
    ["/chefs", 0.6],
    ["/streams", 0.6],
    ["/legal/scan", 0.3],
  ];
  return [
    ...pages.map(([p, priority]) => ({ url: `${base}${p}`, lastModified: now, priority })),
    ...listEditorial().map((r) => ({ url: `${base}/recipes/e/${r.slug}`, lastModified: now, priority: 0.5 })),
  ];
}
