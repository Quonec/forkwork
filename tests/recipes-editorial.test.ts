import { describe, expect, it } from "vitest";
import { EDITORIAL_CATEGORIES, listEditorial } from "@/lib/recipes-editorial";

// Правила: у каждого рецепта ссылка на источник, состав не пуст, шаги есть (кроме помеченных partial).
const list = listEditorial();

describe("рецепты из открытых источников", () => {
  it("файл читается и не пуст", () => {
    expect(list.length).toBeGreaterThan(0);
  });

  it("идентификаторы уникальны, рубрики из набора", () => {
    const slugs = list.map((r) => r.slug);
    expect(slugs.filter((s, i) => slugs.indexOf(s) !== i)).toEqual([]);
    for (const r of list) expect(EDITORIAL_CATEGORIES.map((c) => c.id), r.slug).toContain(r.category);
  });

  it("у каждого есть ссылка на источник, автор и состав", () => {
    for (const r of list) {
      expect(r.source.url, r.slug).toMatch(/^https?:\/\//);
      expect(r.source.name.length, r.slug).toBeGreaterThan(1);
      expect(r.author.length, r.slug).toBeGreaterThan(1);
      expect(r.ingredients.length, r.slug).toBeGreaterThan(1);
      expect([1, 2, 3], r.slug).toContain(r.difficulty);
    }
  });

  it("шаги есть у всех, кроме помеченных partial; partial поясняется в заметке", () => {
    for (const r of list) {
      if (r.partial) {
        expect(r.steps, r.slug).toEqual([]);
        expect(r.note?.length ?? 0, r.slug).toBeGreaterThan(10);
      } else {
        expect(r.steps.length, r.slug).toBeGreaterThan(2);
      }
    }
  });

  it("без эмодзи", () => {
    for (const r of list) expect(/\p{Extended_Pictographic}/u.test(JSON.stringify(r)), r.slug).toBe(false);
  });
});
