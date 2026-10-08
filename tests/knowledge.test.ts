import { describe, expect, it } from "vitest";
import { scoreText, searchStatic } from "@/lib/knowledge";

describe("база знаний AI-агента", () => {
  it("слова запроса находят текст, основа слова даёт неполное совпадение", () => {
    expect(scoreText("рецепт омлета", "Деревенский омлет с картофелем")).toBeGreaterThan(0);
    expect(scoreText("космос", "Деревенский омлет")).toBe(0);
  });

  it("находит рецепты из открытых источников со ссылкой и источником в фактах", () => {
    const hits = searchStatic("рецепт омлет Пепен");
    const r = hits.find((h) => h.type === "recipe");
    expect(r).toBeDefined();
    expect(r!.href).toMatch(/^\/recipes\/e\//);
    expect(r!.text).toContain("Источник:");
  });

  it("отвечает на вопросы из «Частых вопросов» их же текстом", () => {
    const hits = searchStatic("как удалить сообщение в чате");
    const f = hits.find((h) => h.type === "faq");
    expect(f).toBeDefined();
    expect(f!.href).toMatch(/^\/faq#faq-/);
    expect(f!.text.length).toBeGreaterThan(20);
  });

  it("подсказывает раздел сайта по его названию", () => {
    const hits = searchStatic("где дневник");
    expect(hits.some((h) => h.type === "page" && h.href === "/scan/diary")).toBe(true);
  });

  it("новая запись в «Частых вопросах» или рецептах находится без правок агента (источники общие с сайтом)", async () => {
    const { FAQ } = await import("@/lib/faq");
    const { listEditorial } = await import("@/lib/recipes-editorial");
    // каждый вопрос и каждый рецепт, которые видит сайт, ищутся по своему названию
    for (const g of FAQ) for (const it of g.items) expect(searchStatic(it.q).some((h) => h.type === "faq"), it.q).toBe(true);
    for (const r of listEditorial()) expect(searchStatic(r.title).some((h) => h.type === "recipe" && h.id === r.slug), r.title).toBe(true);
  });
});
