/**
 * The scan stream's hard deadline, as pure signal plumbing — the route wires
 * it (packages/api/src/routes/scans.ts), the unit test drives it with fake
 * timers. That is why the clock is the global `setTimeout` and not
 * `AbortSignal.timeout`, whose internal timer fake timers cannot move.
 *
 *  - `withDeadline(signal, ms, onExpire?)` — a signal that aborts when
 *    `signal` does or `ms` later, whichever comes first; `onExpire` runs once,
 *    only when the time ran out (the route: abort the run AND close the
 *    socket). `clear()` in a `finally` disarms it — a finished run keeps no
 *    timer alive.
 *  - `raceAbort(promise, signal)` — the promise, or an AbortError the moment
 *    the signal fires: a recognizer that ignores its signal cannot hold a run
 *    (and the `finally` that clears the stream's timers) past the deadline.
 */

export type Deadline = {
  /** Aborts when the parent signal does, or when the time runs out. */
  readonly signal: AbortSignal;
  /** True once the time ran out — false while it has not, and when the parent aborted first. */
  readonly expired: boolean;
  /** Disarms the timer and detaches from the parent. Idempotent. */
  clear(): void;
};

function timeoutError(ms: number): Error {
  const e = new Error(`the scan stream passed its ${ms} ms deadline`);
  e.name = "TimeoutError";
  return e;
}

function abortError(): Error {
  const e = new Error("the scan was aborted");
  e.name = "AbortError";
  return e;
}

export function withDeadline(signal: AbortSignal, ms: number, onExpire?: () => void): Deadline {
  const controller = new AbortController();
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const onParentAbort = () => {
    clearTimeout(timer);
    timer = undefined;
    controller.abort(signal.reason);
  };

  if (signal.aborted) {
    controller.abort(signal.reason);
  } else {
    signal.addEventListener("abort", onParentAbort, { once: true });
    timer = setTimeout(() => {
      timer = undefined;
      expired = true;
      signal.removeEventListener("abort", onParentAbort);
      controller.abort(timeoutError(ms));
      try {
        onExpire?.();
      } catch (e) {
        // A timer callback that throws would take the process down.
        console.error(`[scan] the deadline hook failed: ${(e as Error)?.message}`);
      }
    }, ms);
  }

  return {
    signal: controller.signal,
    get expired() {
      return expired;
    },
    clear() {
      clearTimeout(timer);
      timer = undefined;
      signal.removeEventListener("abort", onParentAbort);
    },
  };
}

export function raceAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) {
    promise.catch(() => undefined); // settled later by nobody's business — never an unhandled rejection
    return Promise.reject(abortError());
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}
