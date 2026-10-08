import { beforeEach, describe, expect, it } from "vitest";
import { LOGIN_LIMITS, loginBlockedFor, loginFailed, loginSucceeded, resetLoginLimits } from "@/lib/ratelimit";

beforeEach(resetLoginLimits);

describe("ограничение попыток входа", () => {
  it("после 5 неудач на почту вход закрыт, до этого открыт", () => {
    const t = 1_000_000;
    for (let i = 0; i < LOGIN_LIMITS.perEmail - 1; i++) loginFailed("a@x.ru", "1.1.1.1", t + i);
    expect(loginBlockedFor("a@x.ru", "1.1.1.1", t + 10)).toBe(0);
    loginFailed("a@x.ru", "1.1.1.1", t + 5);
    expect(loginBlockedFor("a@x.ru", "1.1.1.1", t + 10)).toBeGreaterThan(0);
  });

  it("блокировка снимается по окончании окна", () => {
    const t = 5_000_000;
    for (let i = 0; i < LOGIN_LIMITS.perEmail; i++) loginFailed("a@x.ru", "1.1.1.1", t);
    expect(loginBlockedFor("a@x.ru", "9.9.9.9", t + 1000)).toBeGreaterThan(0);
    expect(loginBlockedFor("a@x.ru", "9.9.9.9", t + LOGIN_LIMITS.windowMs + 1)).toBe(0);
  });

  it("чужая почта не страдает от неудач на другой", () => {
    for (let i = 0; i < LOGIN_LIMITS.perEmail; i++) loginFailed("a@x.ru", "1.1.1.1");
    expect(loginBlockedFor("b@x.ru", "2.2.2.2")).toBe(0);
  });

  it("с одного адреса перебор разных почт тоже ограничивается", () => {
    for (let i = 0; i < LOGIN_LIMITS.perIp; i++) loginFailed(`u${i}@x.ru`, "3.3.3.3");
    expect(loginBlockedFor("новая@x.ru", "3.3.3.3")).toBeGreaterThan(0);
    expect(loginBlockedFor("новая@x.ru", "4.4.4.4")).toBe(0);
  });

  it("успешный вход сбрасывает счётчик почты", () => {
    for (let i = 0; i < LOGIN_LIMITS.perEmail - 1; i++) loginFailed("a@x.ru", "1.1.1.1");
    loginSucceeded("a@x.ru");
    loginFailed("a@x.ru", "1.1.1.1");
    expect(loginBlockedFor("a@x.ru", "1.1.1.9")).toBe(0);
  });
});
