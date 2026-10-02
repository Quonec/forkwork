import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Хранилище читает DATA_DIR при загрузке модуля, поэтому каталог задаём до импорта.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-vault-"));
let vault: typeof import("@/lib/vault");

beforeAll(async () => {
  vi.resetModules();
  process.env.DATA_DIR = dir;
  delete process.env.CHAT_VAULT_KEY;
  vault = await import("@/lib/vault");
});
afterAll(() => {
  delete process.env.DATA_DIR;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("секретное хранилище сообщений", () => {
  it("сохраняет и возвращает текст, на диске лежит шифртекст", () => {
    vault.vaultPut(5, 11, "Хинкали к 18:00, пожалуйста");
    expect(vault.vaultGet(5, 11)).toBe("Хинкали к 18:00, пожалуйста");
    const raw = fs.readFileSync(path.join(dir, "secret", "chats", "5", "11.msg"));
    expect(raw.toString("utf8")).not.toContain("Хинкали");
  });

  it("файл нельзя подменить: другой чат или номер не расшифровываются", () => {
    vault.vaultPut(5, 12, "секрет");
    fs.copyFileSync(path.join(dir, "secret", "chats", "5", "12.msg"), path.join(dir, "secret", "chats", "5", "13.msg"));
    expect(vault.vaultGet(5, 13)).toBeNull();
  });

  it("повреждённый или отсутствующий файл даёт null, удаление стирает файл", () => {
    expect(vault.vaultGet(5, 999)).toBeNull();
    vault.vaultDelete(5, 11);
    expect(vault.vaultGet(5, 11)).toBeNull();
    expect(fs.existsSync(path.join(dir, "secret", "chats", "5", "11.msg"))).toBe(false);
  });

  it("ключ хранилища создаётся один раз в secret/vault.key", () => {
    const key = fs.readFileSync(path.join(dir, "secret", "vault.key"), "utf8").trim();
    expect(Buffer.from(key, "base64")).toHaveLength(32);
  });
});
