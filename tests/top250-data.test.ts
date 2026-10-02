import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { MoreEntry } from "@/lib/venues/more";

// Правила данных проекта: отзывы дословно, без эмодзи, английские только от авторов
// с латинскими именами, повара только со ссылкой на источник, координаты у каждого.
const DIR = path.join(process.cwd(), "seed", "top250");
const coords = JSON.parse(fs.readFileSync(path.join(DIR, "coords.json"), "utf8")) as Record<string, [number, number]>;
const entries: MoreEntry[] = fs
  .readdirSync(DIR)
  .filter((f) => /^batch-.*\.json$/.test(f))
  .sort()
  .flatMap((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")) as MoreEntry[]);

const CYR = /[А-Яа-яЁё]/;
const EMOJI = /\p{Extended_Pictographic}/u;
const reviewsOf = (e: MoreEntry) => [...(e.g2?.reviews ?? []), ...(e.ya?.reviews ?? [])];

describe("данные топа (seed/top250)", () => {
  it("идентификаторы уникальны", () => {
    const ids = entries.map((e) => e.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });

  it("у каждого заведения есть координаты в пределах Москвы", () => {
    for (const e of entries) {
      const c = coords[e.id];
      expect(c, `нет координат: ${e.id}`).toBeDefined();
      expect(c![0], e.id).toBeGreaterThan(55.4);
      expect(c![0], e.id).toBeLessThan(56.0);
      expect(c![1], e.id).toBeGreaterThan(37.2);
      expect(c![1], e.id).toBeLessThan(38.0);
    }
  });

  it("у каждого есть хотя бы один источник оценок и ссылка-идентификатор верного вида", () => {
    for (const e of entries) {
      expect(e.g2 || e.ya, e.id).toBeTruthy();
      if (e.g2) expect(e.g2.id, e.id).toMatch(/^\d+$/);
      if (e.ya) expect(e.ya.path, e.id).toMatch(/^[a-z0-9_-]+\/\d+$/);
    }
  });

  it("отзывы: тональность из набора, текст не пустой, без эмодзи", () => {
    for (const e of entries) {
      for (const [author, , tone, text] of reviewsOf(e)) {
        expect(["+", "±", "-"], `${e.id}: ${author}`).toContain(tone);
        expect(text.trim().length, `${e.id}: ${author}`).toBeGreaterThan(0);
        expect(EMOJI.test(author + text), `эмодзи: ${e.id}: ${author}`).toBe(false);
      }
    }
  });

  it("пометка en только у авторов с латинскими именами и английского текста", () => {
    for (const e of entries) {
      for (const [author, , , text, lang] of reviewsOf(e)) {
        if (lang === "en") {
          expect(CYR.test(author), `${e.id}: ${author}`).toBe(false);
          expect(CYR.test(text), `${e.id}: ${author}`).toBe(false);
        }
      }
    }
  });

  it("повара названы только со ссылкой на источник", () => {
    for (const e of entries) {
      for (const c of e.chefs ?? []) {
        const [text, url] = Array.isArray(c) ? c : [c.text, c.url];
        expect(text.length, e.id).toBeGreaterThan(10);
        expect(url, e.id).toMatch(/^https?:\/\//);
      }
    }
  });
});
