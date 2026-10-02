/**
 * Deterministic vision stub — the whole scan loop runs on it until the RU
 * provider chosen by the 30-dish eval exists. No network, no model: the answer
 * is a pure function of the image bytes (and an optional hint), so a gate, the
 * seed and the founder's demo see the same plate for the same photo every time.
 *
 *  - the pick: sha256(image) → its first 32 bits (big-endian) mod the number
 *    of plates (plates.ts);
 *  - pinned fixtures, by the sha256 of the repo's seed images (a unit test
 *    re-hashes the files, so a changed asset fails loudly): plov.webp → the
 *    plov plate, pirozhki.webp → the pirozhki plate, chef.webp (a portrait,
 *    no food) → `isFood: false` — the no-food path on demand. Looked up by
 *    the input's `fingerprint` FIRST — the sha256 of the file as the person
 *    picked it, which the lens sends because it re-encodes every photo
 *    (≤ 1280 px JPEG) before the upload, so the uploaded bytes never match a
 *    seed file — then by the sha256 of the uploaded bytes (what the gates,
 *    the seed and the http-smoke send), then the hash pick;
 *  - a hint (trimmed, ≤ 60 characters) that the reference table resolves
 *    overrides the pick with that one dish, 250 g, confidence medium; a hint
 *    it cannot resolve changes nothing. The no-food fixture stays no-food.
 *  - `bbox` per dish from the hash: integer percent 12–78, one horizontal band
 *    per dish so two chips never overlap.
 *
 * Latency: VISION_STUB_DELAY_MS (default 2500, 0 under NODE_ENV=test) is
 * awaited once and aborts with an AbortError the moment the signal fires.
 * Production never meets this recognizer: with the seam stubbed the scan
 * route answers 503 SCAN_UNAVAILABLE before any photo is read.
 */
import { createHash } from "node:crypto";

import { searchFoodReference } from "./food-search";

import { PLATES, plateIndex } from "./plates";
import type { VisionDish, VisionInput, VisionProvider, VisionResult } from "./vision-types";

/** sha256 hex of the repo seed images → what the stub answers for them. */
export const PINNED_FIXTURES: Readonly<Record<string, { plate: string } | "no-food">> = {
  // apps/web/public/seed/plov.webp
  ae8ec69bf44335f2581821856dee7f2152cb2a63141b848553dc43ebfc8d26d1: { plate: "plov" },
  // apps/web/public/seed/pirozhki.webp
  "568a9e3cdd4e4f1c8326d9eb69095be6f909b367368be2ad9e5a181256092712": { plate: "pirozhki" },
  // apps/web/public/seed/chef.webp — a portrait: the no-food fixture
  "083f0d8e88f90c1cedcf41099e20a9fca96f3cb7aa1296aa220d61d810f7026e": "no-food",
};

export const HINT_MAX_LENGTH = 60;
const HINT_GRAMS = 250;
const DEFAULT_DELAY_MS = 2500;
/** The frame area a chip anchor may use (integer percent). */
const BBOX_MIN = 12;
const BBOX_MAX = 78;

type Env = Record<string, string | undefined>;

/** VISION_STUB_DELAY_MS when it is a non-negative integer; else 2500 (0 under test). */
export function visionStubDelayMs(env: Env = process.env): number {
  const raw = env.VISION_STUB_DELAY_MS;
  if (raw !== undefined && raw !== "") {
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 0) return n;
  }
  return env.NODE_ENV === "test" ? 0 : DEFAULT_DELAY_MS;
}

function abortError(): DOMException {
  return new DOMException("The recognition was aborted.", "AbortError");
}

/** Wait `ms` once; reject with an AbortError as soon as `signal` fires (or at once if it already has). */
function waitAbortable(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError());
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * The chip anchor of dish `index` of `count`: one horizontal band per dish
 * (the band's middle ± a third of it), x anywhere in 12–78. Bands never
 * overlap, so neither do the chips; everything stays inside 12–78.
 */
export function bboxFor(hash: Uint8Array, index: number, count: number): { x: number; y: number } {
  const span = BBOX_MAX - BBOX_MIN;
  const band = Math.floor(span / Math.max(1, count));
  const jitter = Math.max(1, Math.floor(band / 3));
  const byteY = hash[(index * 2) % hash.length]!;
  const byteX = hash[(index * 2 + 1) % hash.length]!;
  const y = BBOX_MIN + index * band + Math.floor(band / 2) + ((byteY % jitter) - Math.floor(jitter / 2));
  const x = BBOX_MIN + (byteX % (span + 1));
  return { x, y: Math.min(BBOX_MAX, Math.max(BBOX_MIN, y)) };
}

/** «плов с мясом» → «Плов с мясом»: the table's row name as a display name. */
function displayName(nameRu: string): string {
  return nameRu.charAt(0).toUpperCase() + nameRu.slice(1);
}

function onPlate(dishes: readonly VisionDish[], hash: Uint8Array): VisionResult {
  return {
    isFood: true,
    confidence: dishes[0]?.confidence ?? "medium",
    dishes: dishes.map((d, i) => ({ ...d, bbox: bboxFor(hash, i, dishes.length) })),
  };
}

/** A pinned fixture by a sha256 hex, own keys only (a fingerprint is caller data). */
function pinnedBy(hex: string | undefined): (typeof PINNED_FIXTURES)[string] | undefined {
  return hex !== undefined && Object.hasOwn(PINNED_FIXTURES, hex) ? PINNED_FIXTURES[hex] : undefined;
}

/** The stub's answer for these bytes (+ fingerprint, + hint) — pure, synchronous, no delay. */
export function recognizeStub(input: VisionInput): VisionResult {
  const hash = createHash("sha256").update(input.image).digest();
  // The original file's fingerprint first (it survives the phone's re-encode), then the bytes themselves.
  const pinned = pinnedBy(input.fingerprint) ?? pinnedBy(hash.toString("hex"));
  if (pinned === "no-food") return { isFood: false, confidence: "high", dishes: [] };

  const hint = input.hint?.trim().slice(0, HINT_MAX_LENGTH);
  if (hint) {
    const found = searchFoodReference(hint);
    if (found) {
      return onPlate([{ name: displayName(found.row.name_ru), grams: HINT_GRAMS, confidence: "medium" }], hash);
    }
  }

  const index = pinned ? plateIndex(pinned.plate) : hash.readUInt32BE(0) % PLATES.length;
  return onPlate(PLATES[index]!.dishes, hash);
}

export class StubVisionProvider implements VisionProvider {
  readonly name = "stub";

  /** `delayMs` overrides VISION_STUB_DELAY_MS for this instance (the seed passes 0). */
  constructor(private readonly options: { delayMs?: number } = {}) {}

  async recognize(input: VisionInput, opts?: { signal?: AbortSignal }): Promise<VisionResult> {
    await waitAbortable(this.options.delayMs ?? visionStubDelayMs(), opts?.signal);
    return recognizeStub(input);
  }
}
