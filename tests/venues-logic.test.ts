import { describe, expect, it } from "vitest";
import { spectrumOf, starsOf, votesOf } from "@/lib/venues/spectrum";
import { estimateSegment, segmentOfCheck } from "@/lib/venues/themes";
import { reviewStats } from "@/lib/venues/reviewstats";

describe("спектр звёзд", () => {
  it("приводит оценки к шкале 5", () => {
    expect(starsOf({ value: 9, scale: 10 })).toBe(4.5);
    expect(starsOf({ value: 4.9, scale: 5 })).toBe(4.9);
  });

  it("берёт первое число из подписи с пробелами в разрядах", () => {
    expect(votesOf("15 325 оценок, 6 051 отзыв")).toBe(15325);
    expect(votesOf("40+ отзывов")).toBe(40);
    expect(votesOf("нет данных")).toBeNull();
    expect(votesOf(undefined)).toBeNull();
  });

  it("не усредняет, а даёт размах от минимума до максимума", () => {
    const s = spectrumOf([
      { source: "A", url: "u", value: 4.9, scale: 5, count: "100 оценок", period: "p", kind: "карты" },
      { source: "B", url: "u", value: 8, scale: 10, count: "10 оценок", period: "p", kind: "карты" },
    ]);
    expect(s?.min).toBe(4);
    expect(s?.max).toBe(4.9);
    expect(s?.items.map((i) => i.source)).toEqual(["B", "A"]);
  });

  it("пустой список — нет спектра", () => {
    expect(spectrumOf([])).toBeNull();
  });
});

describe("ценовой сегмент", () => {
  it("границы по среднему чеку", () => {
    expect(segmentOfCheck(500)).toBe("low");
    expect(segmentOfCheck(501)).toBe("mid");
    expect(segmentOfCheck(1500)).toBe("mid");
    expect(segmentOfCheck(1501)).toBe("high");
    expect(segmentOfCheck(3000)).toBe("high");
    expect(segmentOfCheck(3001)).toBe("top");
  });

  it("оценка по виду: фастфуд и кофе навынос — эконом, остальное — средний", () => {
    expect(estimateSegment("fast_food", [], [])).toBe("low");
    expect(estimateSegment("restaurant", ["shawarma"], [])).toBe("low");
    expect(estimateSegment("cafe", [], ["coffee"])).toBe("low");
    expect(estimateSegment("restaurant", [], [])).toBe("mid");
  });
});

describe("статистика отзывов", () => {
  it("считает тональности и источники", () => {
    const mk = (tone: "+" | "±" | "-", source: string) => ({ source, url: "u", author: "a", text: "t", tone });
    const st = reviewStats([mk("+", "A"), mk("+", "B"), mk("±", "A"), mk("-", "B")]);
    expect(st).toMatchObject({ total: 4, plus: 2, mixed: 1, minus: 1, sources: 2 });
  });
});
