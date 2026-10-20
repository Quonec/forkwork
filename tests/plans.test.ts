import { describe, expect, it } from "vitest";
import { CHEF_PLANS, isChefPlan, planOf, planPrice } from "@/lib/plans";

describe("тарифы повара", () => {
  it("три тарифа: Free 3, Single 10 за 1990 ₽, Work 50", () => {
    expect(CHEF_PLANS.map((p) => [p.id, p.dishes, p.priceRub])).toEqual([
      ["free", 3, 0],
      ["single", 10, 1990],
      ["work", 50, null],
    ]);
  });

  it("неизвестный тариф считается Free и не проходит проверку", () => {
    expect(isChefPlan("work")).toBe(true);
    expect(isChefPlan("vip")).toBe(false);
    expect(planOf("vip").id).toBe("free");
    expect(planOf(undefined).dishes).toBe(3);
  });

  it("цена для показа", () => {
    expect(planPrice(planOf("free"))).toBe("Бесплатно");
    expect(planPrice(planOf("single"))).toBe("1 990 ₽");
    expect(planPrice(planOf("work"))).toBe("цена уточняется");
  });
});
