import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL;

/** Закрытые от поисковиков разделы: кабинеты, чаты, заказы, корзина и API. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/admin", "/manager", "/kitchen", "/cabinet", "/chats", "/cart", "/orders", "/favorites", "/onboarding", "/scan/history", "/scan/diary", "/login", "/register"],
      },
    ],
    ...(SITE ? { sitemap: `${SITE.replace(/\/$/, "")}/sitemap.xml` } : {}),
  };
}
