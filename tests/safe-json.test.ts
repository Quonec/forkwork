import { describe, expect, it } from "vitest";

// Модуль queries открывает базу при импорте; для проверки нужна лишь чистая функция.
describe("safeJson", () => {
  it("битое, пустое и неподходящее значение даёт запасное", async () => {
    process.env.DATABASE_PATH ??= ":memory:";
    const { safeJson } = await import("@/lib/queries");
    expect(safeJson<string[]>("[1,2]", [])).toEqual([1, 2]);
    expect(safeJson<string[]>("{oops", [])).toEqual([]);
    expect(safeJson<string[]>(null, ["x"])).toEqual(["x"]);
    expect(safeJson<string[]>('{"a":1}', [])).toEqual([]);
  });
});
