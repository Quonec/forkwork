/**
 * Сквозное шифрование личных чатов (Web Crypto, работает в браузере и в Node).
 *
 * У каждого устройства своя пара ECDH P-256: закрытый ключ не покидает браузер
 * (хранится в IndexedDB как неизвлекаемый), открытый лежит на сервере. Общий ключ чата
 * получается как ECDH(мой закрытый, чужой открытый) → HKDF → AES-GCM-256. Сервер хранит
 * только шифртекст вида `e2e1.<iv>.<данные>`. К шифртексту привязаны номер чата и отправитель
 * (AAD), поэтому сообщение нельзя подсунуть в другой чат или от чужого имени.
 */

export const CIPHER_PREFIX = "e2e1.";
/** Максимальная длина шифртекста: 1000 символов текста в UTF-8 после base64 с запасом. */
export const CIPHER_MAX = 4500;

const b64 = (buf: ArrayBuffer | Uint8Array): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const unb64 = (s: string): Uint8Array<ArrayBuffer> => {
  const t = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(t);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

/** Формат шифртекста: проверяется и сервером, чтобы в базу не попадал открытый текст. */
export const isCipherPayload = (s: unknown): s is string =>
  typeof s === "string" && s.length <= CIPHER_MAX && /^e2e1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22,}$/.test(s);

export type PubJwk = { kty: "EC"; crv: "P-256"; x: string; y: string };

/** Открытый ключ пришёл в верном виде (иначе подмена или мусор). */
export function parsePubJwk(raw: unknown): PubJwk | null {
  try {
    const j = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (j && j.kty === "EC" && j.crv === "P-256" && typeof j.x === "string" && typeof j.y === "string" && j.x.length === 43 && j.y.length === 43)
      return { kty: "EC", crv: "P-256", x: j.x, y: j.y };
  } catch {}
  return null;
}

export async function generateKeyPair(): Promise<{ privateKey: CryptoKey; publicJwk: PubJwk }> {
  const kp = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const jwk = await crypto.subtle.exportKey("jwk", kp.publicKey);
  // Закрытый ключ перезагружаем неизвлекаемым: после этого достать его из браузера нельзя.
  const priv = await crypto.subtle.exportKey("jwk", kp.privateKey);
  const privateKey = await crypto.subtle.importKey("jwk", priv, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
  return { privateKey, publicJwk: { kty: "EC", crv: "P-256", x: jwk.x!, y: jwk.y! } };
}

/** Ключ AES-GCM для одного чата. */
export async function deriveChatKey(privateKey: CryptoKey, peerPub: PubJwk, chatId: number): Promise<CryptoKey> {
  const peer = await crypto.subtle.importKey("jwk", peerPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const bits = await crypto.subtle.deriveBits({ name: "ECDH", public: peer }, privateKey, 256);
  const hk = await crypto.subtle.importKey("raw", bits, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new TextEncoder().encode("forkwork-chat-v1"), info: new TextEncoder().encode(`chat:${chatId}`) },
    hk,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

const aad = (chatId: number, senderId: number) => new TextEncoder().encode(`${chatId}:${senderId}`);

export async function encryptText(key: CryptoKey, text: string, chatId: number, senderId: number): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(chatId, senderId) }, key, new TextEncoder().encode(text));
  return `${CIPHER_PREFIX}${b64(iv)}.${b64(ct)}`;
}

/** Расшифровывает сообщение; при неверном ключе, чате или отправителе возвращает null. */
export async function decryptText(key: CryptoKey, payload: string, chatId: number, senderId: number): Promise<string | null> {
  if (!isCipherPayload(payload)) return null;
  try {
    const [, iv, data] = payload.split(".");
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv!), additionalData: aad(chatId, senderId) }, key, unb64(data!));
    return new TextDecoder().decode(pt);
  } catch {
    return null;
  }
}

/** Код безопасности пары ключей: у обоих собеседников совпадает, сверяется голосом или лично. */
export async function safetyCode(a: PubJwk, b: PubJwk): Promise<string> {
  const parts = [`${a.x}.${a.y}`, `${b.x}.${b.y}`].sort();
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parts.join("|"))));
  const hex = Array.from(h.slice(0, 10), (x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();
  return hex.match(/.{4}/g)!.join(" ");
}

// ── Хранение ключа устройства (только браузер) ──
const DB = "fw-e2ee";
const STORE = "keys";
const idb = <T,>(fn: (s: IDBObjectStore) => IDBRequest<T>, mode: IDBTransactionMode): Promise<T> =>
  new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const req = fn(open.result.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    };
  });

export type DeviceKey = { privateKey: CryptoKey; publicJwk: PubJwk };
export const loadDeviceKey = (userId: number) => idb<DeviceKey | undefined>((s) => s.get(`user:${userId}`), "readonly");
export const saveDeviceKey = (userId: number, k: DeviceKey) => idb((s) => s.put(k, `user:${userId}`), "readwrite");
export const e2eeAvailable = (): boolean => typeof crypto !== "undefined" && !!crypto.subtle && typeof indexedDB !== "undefined";
