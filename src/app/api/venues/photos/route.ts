import { NextResponse } from "next/server";

import { isResponse, requireUser } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { CAPTION_MAX, MAX_PHOTO_BYTES, addPhoto, listPhotos, photoCounts, venueExists } from "@/lib/venues/photos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fail = (code: string, message: string, status: number) => NextResponse.json({ error: message, code }, { status });

/**
 * Общая галерея заведений.
 *   ?counts=1       сколько фото у каждого заведения, у которого они есть
 *   ?venue=<id>     фото заведения (до 24 свежих) и их число
 */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  if (p.get("counts")) return NextResponse.json({ counts: photoCounts() });
  const venue = (p.get("venue") ?? "").trim();
  if (!venue || !venueExists(venue)) return fail("VENUE_UNKNOWN", "Заведение не найдено", 404);
  const user = await getSessionUser();
  return NextResponse.json(listPhotos(venue, user?.id ?? null));
}

/** Добавить фото в общий доступ: вошедший пользователь, согласие на публикацию, JPEG/PNG/WebP до 3 МБ. */
export async function POST(req: Request) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("BAD_REQUEST", "Не получилось прочитать запрос", 400);
  }
  if (form.get("consent") !== "1") return fail("CONSENT_REQUIRED", "Нужно согласие на публикацию фото", 403);
  const venue = String(form.get("venue") ?? "").trim();
  if (!venueExists(venue)) return fail("VENUE_UNKNOWN", "Заведение не найдено", 404);
  const file = form.get("photo");
  if (!(file instanceof File) || file.size === 0) return fail("PHOTO_REQUIRED", "Нужно фото", 400);
  if (file.size > MAX_PHOTO_BYTES) return fail("PHOTO_TOO_LARGE", "Фото больше 3 МБ", 413);
  const caption = String(form.get("caption") ?? "").slice(0, CAPTION_MAX);
  const res = addPhoto(user.id, venue, new Uint8Array(await file.arrayBuffer()), caption);
  if (res.ok) return NextResponse.json({ photo: res.photo, ...listPhotos(venue, user.id) }, { status: 201 });
  const map = {
    VENUE_UNKNOWN: ["Заведение не найдено", 404],
    TOO_LARGE: ["Фото больше 3 МБ", 413],
    BAD_IMAGE: ["Нужно фото в формате JPEG, PNG или WebP", 415],
    LIMIT_VENUE: ["Не больше 5 ваших фото у одного заведения", 429],
    LIMIT_DAY: ["На сегодня лимит фото исчерпан, продолжите завтра", 429],
  } as const;
  const [message, status] = map[res.code];
  return fail(res.code, message, status);
}
