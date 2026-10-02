import { NextResponse } from "next/server";

import { isResponse, requireScanUser } from "@/lib/api";
import { withDeadline } from "@/lib/scan/deadline";
import { encodeSse } from "@/lib/scan/sse";
import { runScan } from "@/lib/scan/run";
import { SCAN_STREAM_DEADLINE_MS, scanDailyLimit } from "@/lib/scan/retention";
import { StubVisionProvider } from "@/lib/scan/stub-provider";
import {
  countScansToday,
  createScan,
  guestScansUsed,
  hasScanConsent,
  listScansForOwner,
  sniffImageType,
  sweepGuests,
  sweepScans,
} from "@/lib/scan/store";
import { GUEST_SCAN_LIMIT, isGuestEmail } from "@/lib/guest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const HINT_MAX = 60;
const PING_MS = 15_000;

const fail = (code: string, message: string, status: number) => NextResponse.json({ error: message, code }, { status });

export async function GET(req: Request) {
  const user = await requireScanUser();
  if (isResponse(user)) return user;
  const url = new URL(req.url);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 20));
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  const rows = listScansForOwner(user.id, limit + 1, offset);
  return NextResponse.json({ scans: rows.slice(0, limit), hasMore: rows.length > limit });
}

export async function POST(req: Request) {
  const user = await requireScanUser();
  if (isResponse(user)) return user;

  const limit = scanDailyLimit();
  if (limit <= 0) return fail("SCAN_UNAVAILABLE", "Сканер скоро", 503);
  if (!hasScanConsent(user.id)) return fail("CONSENT_REQUIRED", "Нужно согласие на обработку фото", 403);
  if (countScansToday(user.id) >= limit) return fail("SCAN_DAILY_LIMIT", "Сегодня сканов больше нет — до завтра", 429);
  if (isGuestEmail(user.email) && guestScansUsed(user.id) >= GUEST_SCAN_LIMIT) {
    return fail("GUEST_LIMIT", "Бесплатный скан использован — зарегистрируйтесь, чтобы сканировать дальше", 403);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("BAD_REQUEST", "Не получилось прочитать запрос", 400);
  }
  const file = form.get("photo");
  if (!(file instanceof File) || file.size === 0) return fail("PHOTO_REQUIRED", "Нужно фото", 400);
  if (file.size > MAX_PHOTO_BYTES) return fail("PHOTO_TOO_LARGE", "Фото слишком большое", 413);
  const image = new Uint8Array(await file.arrayBuffer());
  const contentType = sniffImageType(image);
  if (!contentType) return fail("PHOTO_INVALID", "Нужно фото в формате JPEG, PNG или WebP", 415);

  const rawHint = form.get("hint");
  const hint = typeof rawHint === "string" ? rawHint.trim().slice(0, HINT_MAX) : "";
  const rawSha = form.get("originalSha256");
  const fingerprint = typeof rawSha === "string" && /^[0-9a-f]{64}$/.test(rawSha) ? rawSha : undefined;

  try {
    sweepScans();
    sweepGuests();
  } catch (e) {
    console.error(`[scan] sweep failed: ${(e as Error).message}`);
  }

  const provider = new StubVisionProvider();
  const scanId = createScan(user.id, provider.name, image, contentType);

  const encoder = new TextEncoder();
  const own = new AbortController();
  const deadline = withDeadline(AbortSignal.any([req.signal, own.signal]), SCAN_STREAM_DEADLINE_MS, () => own.abort());

  const stream = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      // 1 KB of padding so a buffering proxy releases the first frame at once.
      ctrl.enqueue(encoder.encode(`:${" ".repeat(1024)}\n\n`));
      const ping = setInterval(() => {
        try {
          ctrl.enqueue(encoder.encode(": ping\n\n"));
        } catch {}
      }, PING_MS);
      try {
        await runScan({
          scanId,
          userId: user.id,
          image,
          contentType,
          ...(hint ? { hint } : {}),
          ...(fingerprint ? { fingerprint } : {}),
          provider,
          signal: deadline.signal,
          emit: (ev) => {
            ctrl.enqueue(encoder.encode(encodeSse(ev.event, ev.data)));
          },
        });
      } finally {
        clearInterval(ping);
        deadline.clear();
        try {
          ctrl.close();
        } catch {}
      }
    },
    cancel() {
      own.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
