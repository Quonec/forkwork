/**
 * Ограничение неудачных попыток входа. Счётчики держатся в памяти процесса: при перезапуске
 * они обнуляются, а при нескольких экземплярах приложения у каждого свои. Для одного экземпляра
 * этого достаточно, для нескольких нужно общее хранилище.
 *
 * Считаем отдельно по почте (защита аккаунта от перебора) и по адресу клиента (защита от перебора
 * многих аккаунтов с одного места). Успешный вход сбрасывает счётчик почты.
 */

type Bucket = { fails: number[] };

export const LOGIN_LIMITS = {
  /** Окно подсчёта, мс. */
  windowMs: 15 * 60_000,
  /** Неудач на одну почту за окно. */
  perEmail: 5,
  /** Неудач на один адрес клиента за окно. */
  perIp: 20,
} as const;

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 10_000;

function recent(key: string, now: number): number[] {
  const b = buckets.get(key);
  if (!b) return [];
  b.fails = b.fails.filter((t) => now - t < LOGIN_LIMITS.windowMs);
  if (b.fails.length === 0) buckets.delete(key);
  return b.fails;
}

/** Секунд до разблокировки, если вход сейчас запрещён; иначе 0. */
export function loginBlockedFor(email: string, ip: string, now = Date.now()): number {
  let wait = 0;
  for (const [key, max] of [
    [`e:${email}`, LOGIN_LIMITS.perEmail],
    [`i:${ip}`, LOGIN_LIMITS.perIp],
  ] as const) {
    const fails = recent(key, now);
    if (fails.length >= max) {
      const until = fails[fails.length - max]! + LOGIN_LIMITS.windowMs;
      wait = Math.max(wait, Math.ceil((until - now) / 1000));
    }
  }
  return Math.max(0, wait);
}

export function loginFailed(email: string, ip: string, now = Date.now()): void {
  if (buckets.size > MAX_KEYS) buckets.clear(); // защита памяти от потока случайных почт
  for (const key of [`e:${email}`, `i:${ip}`]) {
    const b = buckets.get(key) ?? { fails: [] };
    b.fails.push(now);
    buckets.set(key, b);
  }
}

export function loginSucceeded(email: string): void {
  buckets.delete(`e:${email}`);
}

/** Адрес клиента: за прокси хостинга берём первый адрес из X-Forwarded-For. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown").slice(0, 64);
}

/** Только для тестов. */
export function resetLoginLimits(): void {
  buckets.clear();
}
