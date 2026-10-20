import { describe, expect, it } from "vitest";
import { mealAt, sellLabel } from "@/lib/meal";

const at = (h: number, m = 0) => new Date(2026, 9, 20, h, m);

describe("кнопка «Продать …» по времени суток", () => {
  it("завтрак с 5:00 до 11:00, обед с 11:00 до 17:00, ужин с 17:00 до 5:00", () => {
    expect(mealAt(at(5))).toBe("breakfast");
    expect(mealAt(at(10, 59))).toBe("breakfast");
    expect(mealAt(at(11))).toBe("lunch");
    expect(mealAt(at(16, 59))).toBe("lunch");
    expect(mealAt(at(17))).toBe("dinner");
    expect(mealAt(at(23, 30))).toBe("dinner");
    expect(mealAt(at(0))).toBe("dinner");
    expect(mealAt(at(4, 59))).toBe("dinner");
  });

  it("подписи", () => {
    expect(sellLabel("breakfast")).toBe("Продать завтрак");
    expect(sellLabel("lunch")).toBe("Продать обед");
    expect(sellLabel("dinner")).toBe("Продать ужин");
  });
});
