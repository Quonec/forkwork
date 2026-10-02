import { describe, expect, it } from "vitest";
import { decryptText, deriveChatKey, encryptText, generateKeyPair, isCipherPayload, parsePubJwk, safetyCode } from "@/lib/e2ee";

describe("сквозное шифрование чатов", () => {
  it("собеседники получают один и тот же ключ и читают сообщения друг друга", async () => {
    const a = await generateKeyPair();
    const b = await generateKeyPair();
    const ka = await deriveChatKey(a.privateKey, b.publicJwk, 7);
    const kb = await deriveChatKey(b.privateKey, a.publicJwk, 7);
    const payload = await encryptText(ka, "Здравствуйте! Хинкали на субботу?", 7, 1);
    expect(isCipherPayload(payload)).toBe(true);
    expect(payload).not.toContain("хинкали");
    expect(await decryptText(kb, payload, 7, 1)).toBe("Здравствуйте! Хинкали на субботу?");
  });

  it("чужой ключ, другой чат или другой отправитель не расшифровывают", async () => {
    const a = await generateKeyPair();
    const b = await generateKeyPair();
    const c = await generateKeyPair();
    const kab = await deriveChatKey(a.privateKey, b.publicJwk, 7);
    const payload = await encryptText(kab, "секрет", 7, 1);
    expect(await decryptText(await deriveChatKey(c.privateKey, b.publicJwk, 7), payload, 7, 1)).toBeNull();
    expect(await decryptText(await deriveChatKey(a.privateKey, b.publicJwk, 8), payload, 8, 1)).toBeNull();
    expect(await decryptText(kab, payload, 7, 2)).toBeNull();
    expect(await decryptText(kab, payload, 8, 1)).toBeNull();
  });

  it("каждое шифрование даёт новый шифртекст", async () => {
    const a = await generateKeyPair();
    const b = await generateKeyPair();
    const k = await deriveChatKey(a.privateKey, b.publicJwk, 1);
    expect(await encryptText(k, "да", 1, 1)).not.toBe(await encryptText(k, "да", 1, 1));
  });

  it("сервер отвергает открытый текст и мусор", () => {
    expect(isCipherPayload("привет")).toBe(false);
    expect(isCipherPayload("e2e1.abc.def")).toBe(false);
    expect(isCipherPayload(undefined)).toBe(false);
    expect(isCipherPayload("e2e1." + "A".repeat(16) + "." + "B".repeat(5000))).toBe(false);
  });

  it("код безопасности одинаков у обоих и меняется при смене ключа", async () => {
    const a = await generateKeyPair();
    const b = await generateKeyPair();
    const c = await generateKeyPair();
    expect(await safetyCode(a.publicJwk, b.publicJwk)).toBe(await safetyCode(b.publicJwk, a.publicJwk));
    expect(await safetyCode(a.publicJwk, b.publicJwk)).not.toBe(await safetyCode(a.publicJwk, c.publicJwk));
  });

  it("открытый ключ проверяется по форме", async () => {
    const a = await generateKeyPair();
    expect(parsePubJwk(JSON.stringify(a.publicJwk))).toEqual(a.publicJwk);
    expect(parsePubJwk({ ...a.publicJwk, crv: "P-384" })).toBeNull();
    expect(parsePubJwk({ ...a.publicJwk, x: "короткий" })).toBeNull();
    expect(parsePubJwk("не json")).toBeNull();
  });
});
