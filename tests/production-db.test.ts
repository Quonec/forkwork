import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

// Первый запуск в продакшене: без демо-аккаунтов, только справочники и администратор из переменных окружения.
const dirs: string[] = [];
const saved = { ...process.env };
afterAll(() => {
  process.env = saved;
  // На Windows открытая база не даёт удалить каталог сразу: пробуем, остаток уберёт система.
  try {
    (globalThis as { __fwdb?: { close(): void } }).__fwdb?.close();
  } catch {}
  for (const d of dirs) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {}
  }
});

async function freshDb(env: Record<string, string>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-prod-"));
  dirs.push(dir);
  vi.resetModules();
  delete (globalThis as { __fwdb?: unknown }).__fwdb;
  Object.assign(process.env, { NODE_ENV: "production", DATA_DIR: dir }, env);
  const { db } = await import("@/lib/db");
  return db;
}

describe("база в продакшене", () => {
  it("без демо-аккаунтов: кухни и один администратор с хэшем пароля", async () => {
    const db = await freshDb({ ADMIN_EMAIL: "Boss@Example.com", ADMIN_PASSWORD: "очень-длинный-пароль-1", SEED_DEMO: "" });
    const users = db.prepare("SELECT email, role, pass_hash AS hash FROM users").all() as { email: string; role: string; hash: string }[];
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ email: "boss@example.com", role: "admin" });
    expect(users[0]!.hash).not.toContain("очень-длинный");
    expect((db.prepare("SELECT COUNT(*) AS n FROM cuisines").get() as { n: number }).n).toBeGreaterThan(5);
    expect((db.prepare("SELECT COUNT(*) AS n FROM chats").get() as { n: number }).n).toBe(0);
  });

  it("без ADMIN_* или с коротким паролем администратор не создаётся", async () => {
    const db = await freshDb({ ADMIN_EMAIL: "", ADMIN_PASSWORD: "короткий", SEED_DEMO: "" });
    expect((db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n).toBe(0);
  });

  it("SEED_DEMO=1 возвращает демо-данные", async () => {
    const db = await freshDb({ SEED_DEMO: "1", ADMIN_EMAIL: "", ADMIN_PASSWORD: "" });
    expect((db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n).toBeGreaterThan(5);
  });
});
