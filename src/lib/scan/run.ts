/**
 * runScan — the analysis behind the stream. Emits the wire vocabulary
 * (events.ts) in this order while it works:
 *
 *   started → progress(1) + log looking → [recognize] →
 *     no food: status no_food, photo deleted, log noFood + error NO_FOOD;
 *   item_found + log see {name} per dish → stage_done 1 →
 *   progress(2) + log weighing → per dish: labelDish → item_enriched
 *     (or log unlabelled: the dish is dropped) → stage_done 2 →
 *   progress(3) + log summing →
 *     nothing labelled: status failed (NOTHING_LABELLED), photo deleted;
 *   ONE transaction (items + status done) → done { view }.
 *
 * Endings: a throw → status failed + a stable code, photo deleted, error
 * SCAN_FAILED; the signal aborted at any await → status cancelled, photo
 * deleted, error SCAN_CANCELLED. Every terminal write is a compare-and-set on
 * `analyzing`. Logs name the scan id and a code — never a dish or the hint.
 */
import crypto from "node:crypto";

import { raceAbort } from "./deadline";
import type { ScanEvent } from "./events";
import { labelDish, type LabelledDish } from "./label";
import { scaleTo } from "./nutrition";
import { completeScan, endWithoutResult, getScanForOwner } from "./store";
import { visionStubDelayMs } from "./stub-provider";
import type { VisionContentType, VisionProvider, VisionResult } from "./vision-types";

export type RunScanInput = {
  scanId: string;
  userId: number;
  image: Uint8Array;
  contentType: VisionContentType;
  hint?: string;
  fingerprint?: string;
  provider: VisionProvider;
  emit: (event: ScanEvent) => void | Promise<void>;
  signal?: AbortSignal;
  paceMs?: number;
};

export type RunScanOutcome = "done" | "no_food" | "failed" | "cancelled";

const DEFAULT_PACE_MS = 450;
const MIN_ETA_SECONDS = 6;
const TYPICAL_BEATS = 6;
const MIN_GRAMS = 1;
const MAX_GRAMS = 5000;

export function scanPaceMs(env: Record<string, string | undefined> = process.env): number {
  const raw = env.SCAN_PACE_MS;
  if (raw !== undefined && raw !== "") {
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 0) return n;
  }
  return DEFAULT_PACE_MS;
}

class ScanAborted extends Error {
  constructor() {
    super("scan aborted");
    this.name = "AbortError";
  }
}

class ScanFailure extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function waitAbortable(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new ScanAborted());
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new ScanAborted());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function runScan(input: RunScanInput): Promise<RunScanOutcome> {
  const { scanId, userId, signal } = input;
  const paceMs = input.paceMs ?? scanPaceMs();

  const checkAborted = () => {
    if (signal?.aborted) throw new ScanAborted();
  };
  const emit = async (event: ScanEvent) => {
    try {
      await input.emit(event);
    } catch {
      // A write to a gone client — the abort signal carries that news.
    }
    checkAborted();
  };
  const pace = async () => {
    checkAborted();
    if (paceMs > 0) await waitAbortable(paceMs, signal);
  };
  const emitFinal = async (event: ScanEvent) => {
    try {
      await input.emit(event);
    } catch {
      // Nobody to tell.
    }
  };

  try {
    checkAborted();
    const etaSeconds = Math.max(MIN_ETA_SECONDS, Math.ceil((visionStubDelayMs() + TYPICAL_BEATS * paceMs) / 1000));
    await emit({ event: "started", data: { scanId, etaSeconds, stages: 3 } });
    await emit({ event: "progress", data: { stage: 1, progress: 0.05 } });
    await emit({ event: "log", data: { key: "looking" } });

    let result: VisionResult;
    try {
      result = await raceAbort(
        input.provider.recognize(
          {
            image: input.image,
            contentType: input.contentType,
            ...(input.hint ? { hint: input.hint } : {}),
            ...(input.fingerprint ? { fingerprint: input.fingerprint } : {}),
          },
          { signal },
        ),
        signal,
      );
    } catch (e) {
      if (signal?.aborted || (e as Error)?.name === "AbortError") throw new ScanAborted();
      throw new ScanFailure("PROVIDER_ERROR");
    }
    checkAborted();

    const dishes = result.isFood ? result.dishes.filter((d) => Number.isFinite(d.grams) && d.grams > 0) : [];
    if (dishes.length === 0) {
      endWithoutResult(scanId, "no_food", "NO_FOOD");
      await emitFinal({ event: "log", data: { key: "noFood" } });
      await emitFinal({ event: "error", data: { code: "NO_FOOD", recoverable: true } });
      return "no_food";
    }

    const found = dishes.map((dish) => ({ id: crypto.randomUUID(), dish }));
    for (const [i, { id, dish }] of found.entries()) {
      if (i > 0) await pace();
      const grams = Math.min(MAX_GRAMS, Math.max(MIN_GRAMS, Math.round(dish.grams)));
      await emit({ event: "item_found", data: { id, name: dish.name, grams, ...(dish.bbox ? { bbox: dish.bbox } : {}) } });
      await emit({ event: "log", data: { key: "see", params: { name: dish.name } } });
    }
    await pace();
    await emit({ event: "stage_done", data: { stage: 1 } });

    await emit({ event: "progress", data: { stage: 2, progress: 0.45 } });
    await emit({ event: "log", data: { key: "weighing" } });
    const labelled: { id: string; dish: LabelledDish; grams: number }[] = [];
    for (const { id, dish } of found) {
      await pace();
      const l = labelDish(dish);
      if (!l) {
        await emit({ event: "log", data: { key: "unlabelled", params: { name: dish.name } } });
        continue;
      }
      const grams = Math.min(MAX_GRAMS, Math.max(MIN_GRAMS, Math.round(l.grams)));
      labelled.push({ id, dish: l, grams });
      await emit({ event: "item_enriched", data: { id, source: l.source, kcal: scaleTo(l.per100g.kcal, grams) } });
    }
    await pace();
    await emit({ event: "stage_done", data: { stage: 2 } });

    await emit({ event: "progress", data: { stage: 3, progress: 0.75 } });
    await emit({ event: "log", data: { key: "summing" } });
    if (labelled.length === 0) {
      endWithoutResult(scanId, "failed", "NOTHING_LABELLED");
      await emitFinal({ event: "error", data: { code: "NOTHING_LABELLED", recoverable: true } });
      return "failed";
    }
    await pace();
    checkAborted();

    try {
      completeScan(scanId, result.confidence, labelled);
    } catch (e) {
      throw new ScanFailure((e as Error).message === "SCAN_GONE" ? "SCAN_GONE" : "INTERNAL");
    }

    const view = getScanForOwner(userId, scanId);
    if (!view) {
      await emitFinal({ event: "error", data: { code: "SCAN_FAILED", recoverable: true } });
      return "failed";
    }
    await emitFinal({ event: "done", data: { scanId, view } });
    return "done";
  } catch (e) {
    if (e instanceof ScanAborted || signal?.aborted) {
      try {
        endWithoutResult(scanId, "cancelled", null);
      } catch (err) {
        console.error(`[scan] ${scanId}: the cancel could not be recorded: ${(err as Error).message}`);
      }
      await emitFinal({ event: "error", data: { code: "SCAN_CANCELLED", recoverable: false } });
      return "cancelled";
    }
    const code = e instanceof ScanFailure ? e.code : "INTERNAL";
    console.error(`[scan] ${scanId} failed (${code})${e instanceof ScanFailure ? "" : `: ${(e as Error)?.message}`}`);
    try {
      endWithoutResult(scanId, "failed", code);
    } catch (err) {
      console.error(`[scan] ${scanId}: the failure could not be recorded: ${(err as Error).message}`);
    }
    await emitFinal({ event: "error", data: { code: "SCAN_FAILED", recoverable: true } });
    return "failed";
  }
}
