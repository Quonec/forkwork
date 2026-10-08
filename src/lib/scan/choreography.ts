/**
 * The analysis overlay's timing, ported from the legacy lens (fork-app
 * static/js/app.js 366–536) as pure pieces the client component drives —
 * no requestAnimationFrame, no DOM, no clock of its own.
 *
 * ProgressDriver — the bar never sits still and never goes backwards. A
 * synthetic ease-out target rises over the expected duration, clamped to the
 * active stage's end × 0.92 so a real milestone always has room to snap the
 * bar higher; server `progress` values only ever raise the target (monotonic);
 * `current` lerps toward max(synthetic, server) at 0.12 when far (> 0.05)
 * and 0.08 when near, capped at 0.999 until `done`. The synthetic ceiling per
 * stage is the legacy `_STAGE_END` (0.40 / 0.70 / 0.95): stage 3's is 0.95,
 * not STAGE_RANGES' 1 — the last 5 % belongs to the real `done`.
 *
 * The paced queue — a burst from the server (every `item_found` at once after
 * recognition) is handed to the overlay one beat at a time: `gapMsFor` says
 * how long each event holds the stage (a chip 450 ms, an enrichment 250 ms,
 * everything else 0), and `drain()` resolves when the queue is idle, so
 * «Готово» never cuts a chip off. Running state is a synchronous flag, never
 * a stored promise (the legacy race where a zero-gap drain finished before its
 * own promise was assigned and later scans sat at 0 %).
 */
import type { ScanStage } from "./events";

export const STAGE_RANGES: Readonly<Record<ScanStage, readonly [number, number]>> = {
  1: [0, 0.4],
  2: [0.4, 0.7],
  3: [0.7, 1],
};

/** The synthetic target's ceiling per stage (legacy `_STAGE_END`), before × 0.92. */
export const STAGE_SYNTHETIC_END: Readonly<Record<ScanStage, number>> = { 1: 0.4, 2: 0.7, 3: 0.95 };

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export class ProgressDriver {
  current = 0;
  serverTarget = 0;
  stage: ScanStage = 1;
  expectedTotalMs = 35_000;
  private startMs: number | null = null;

  /** A fresh run expected to take `etaMs` (at least 8 s; 35 s when unknown). The first `tick` is t = 0 unless `nowMs` is given. */
  start(etaMs: number, nowMs?: number): void {
    this.current = 0;
    this.serverTarget = 0;
    this.stage = 1;
    this.expectedTotalMs = Math.max(8_000, etaMs > 0 ? etaMs : 35_000);
    this.startMs = nowMs ?? null;
  }

  /** A server progress value (0..1): only ever raises the target. */
  bump(progress: number): void {
    const v = clamp01(Number(progress) || 0);
    if (v > this.serverTarget) this.serverTarget = v;
  }

  /** Stage only moves forward — a late event never pulls the ceiling back. */
  setStage(n: number): void {
    if (Number.isFinite(n) && n > this.stage) this.stage = Math.min(3, Math.trunc(n)) as ScanStage;
  }

  /** Advance one frame at `nowMs` and return the value to render (0..0.999). */
  tick(nowMs: number): number {
    if (this.startMs === null) this.startMs = nowMs;
    const elapsed = Math.max(0, nowMs - this.startMs);
    const t = Math.min(1, elapsed / (this.expectedTotalMs * 1.05));
    const synthetic = (1 - Math.pow(1 - t, 1.4)) * STAGE_SYNTHETIC_END[this.stage] * 0.92;
    const target = Math.max(synthetic, this.serverTarget);
    const delta = target - this.current;
    const rate = Math.abs(delta) > 0.05 ? 0.12 : 0.08;
    this.current += delta * rate;
    if (this.current > 0.999) this.current = 0.999;
    return this.current;
  }
}

/** How long each event holds the overlay before the next one is shown (ms). */
export const EVENT_GAP_MS: Readonly<Record<string, number>> = {
  item_found: 450,
  item_enriched: 250,
  item_revised: 250,
};

export function gapMsFor(event: { event: string }): number {
  return EVENT_GAP_MS[event.event] ?? 0;
}

export type EventQueue<E> = {
  push(event: E): void;
  /** Resolves once every queued event was handled and its gap has passed; rejects with a handler's error. */
  drain(): Promise<void>;
  /** Drop what is still queued (a cancel) and release every `drain()` waiter. */
  clear(): void;
};

type Waiter = { resolve: () => void; reject: (e: unknown) => void };

export function createEventQueue<E extends { event: string }>(
  handle: (event: E) => void,
  opts: {
    gapMsFor?: (event: E) => number;
    setTimeout?: (fn: () => void, ms: number) => unknown;
  } = {},
): EventQueue<E> {
  const gapOf = opts.gapMsFor ?? gapMsFor;
  const schedule = opts.setTimeout ?? ((fn: () => void, ms: number) => globalThis.setTimeout(fn, ms));
  const queue: E[] = [];
  let running = false;
  let failure: { error: unknown } | null = null;
  let waiters: Waiter[] = [];

  const settle = () => {
    const ws = waiters;
    waiters = [];
    for (const w of ws) {
      if (failure) w.reject(failure.error);
      else w.resolve();
    }
  };

  const run = async () => {
    try {
      while (queue.length > 0) {
        const event = queue.shift()!;
        handle(event);
        const gap = gapOf(event);
        if (gap > 0) await new Promise<void>((resolve) => void schedule(resolve, gap));
      }
    } catch (error) {
      // A handler threw (the overlay's `error` handling does, like the legacy
      // one): stop, drop the rest, and hand the error to whoever awaits drain().
      failure = { error };
      queue.length = 0;
    } finally {
      running = false;
      settle();
    }
  };

  return {
    push(event) {
      if (failure) return;
      queue.push(event);
      if (!running) {
        running = true;
        void run();
      }
    },
    drain() {
      if (failure) return Promise.reject(failure.error);
      if (!running && queue.length === 0) return Promise.resolve();
      return new Promise<void>((resolve, reject) => waiters.push({ resolve, reject }));
    },
    clear() {
      queue.length = 0;
      settle();
    },
  };
}
