/**
 * Секретное хранилище сообщений чатов без сквозного шифрования.
 *
 * Текст такого сообщения не попадает в основную базу: в ней остаётся только запись (номер,
 * отправитель, время), а сам текст лежит отдельным файлом в `<DATA_DIR>/secret/chats/<чат>/<номер>.msg`.
 * Файл зашифрован ключом сервера (AES-256-GCM): ключ берётся из переменной CHAT_VAULT_KEY
 * (base64, 32 байта) или создаётся рядом в `secret/vault.key`. Это защита хранилища на диске,
 * а не сквозное шифрование: сервер текст читает, поэтому в таких чатах он доступен и администрации.
 * Каталог `data/` не попадает в git.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./db";

const SECRET_DIR = path.join(DATA_DIR, "secret");

let cachedKey: Buffer | null = null;
function vaultKey(): Buffer {
  if (cachedKey) return cachedKey;
  const env = process.env.CHAT_VAULT_KEY;
  if (env) {
    const k = Buffer.from(env, "base64");
    if (k.length !== 32) throw new Error("CHAT_VAULT_KEY должен быть base64 от 32 байт");
    return (cachedKey = k);
  }
  const file = path.join(SECRET_DIR, "vault.key");
  fs.mkdirSync(SECRET_DIR, { recursive: true, mode: 0o700 });
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(32).toString("base64"), { mode: 0o600, flag: "wx" });
  return (cachedKey = Buffer.from(fs.readFileSync(file, "utf8").trim(), "base64"));
}

const fileOf = (chatId: number, messageId: number) => path.join(SECRET_DIR, "chats", String(chatId), `${messageId}.msg`);
const aad = (chatId: number, messageId: number) => Buffer.from(`${chatId}:${messageId}`);

export function vaultPut(chatId: number, messageId: number, text: string): void {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", vaultKey(), iv);
  c.setAAD(aad(chatId, messageId));
  const ct = Buffer.concat([c.update(text, "utf8"), c.final()]);
  const file = fileOf(chatId, messageId);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, Buffer.concat([iv, c.getAuthTag(), ct]), { mode: 0o600 });
}

/** Текст сообщения или null, если файла нет или он повреждён. */
export function vaultGet(chatId: number, messageId: number): string | null {
  try {
    const buf = fs.readFileSync(fileOf(chatId, messageId));
    const d = crypto.createDecipheriv("aes-256-gcm", vaultKey(), buf.subarray(0, 12));
    d.setAAD(aad(chatId, messageId));
    d.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function vaultDelete(chatId: number, messageId: number): void {
  try {
    fs.rmSync(fileOf(chatId, messageId), { force: true });
  } catch {}
}
