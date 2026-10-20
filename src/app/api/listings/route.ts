import { NextResponse } from "next/server";

import { isResponse, requireUser } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { isGuestEmail } from "@/lib/guest";
import { addListing, listListings, MAX_LISTING_PHOTO_BYTES, MAX_LISTING_VIDEO_BYTES } from "@/lib/listings";
import { type Meal } from "@/lib/meal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fail = (code: string, message: string, status: number) => NextResponse.json({ error: message, code }, { status });

/** Плитки «продаю блюдо»: свежие от всех (?mine=1 — только свои). */
export async function GET(req: Request) {
  const user = await getSessionUser();
  const mine = new URL(req.url).searchParams.get("mine") === "1";
  return NextResponse.json({ listings: listListings(user?.id ?? null, { mine: mine && !!user }) });
}

/** Выставить своё блюдо: название, цена в FC, приём пищи, фото (обязательно) и видео (по желанию). */
export async function POST(req: Request) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  if (isGuestEmail(user.email)) return fail("LOGIN_REQUIRED", "Чтобы продать блюдо, войдите или зарегистрируйтесь", 401);
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("BAD_REQUEST", "Не получилось прочитать запрос: возможно, файлы слишком большие", 400);
  }
  const photo = form.get("photo");
  if (!(photo instanceof File) || photo.size === 0) return fail("PHOTO_REQUIRED", "Добавьте фото блюда", 400);
  if (photo.size > MAX_LISTING_PHOTO_BYTES) return fail("PHOTO_TOO_LARGE", "Фото больше 8 МБ", 413);
  const video = form.get("video");
  const hasVideo = video instanceof File && video.size > 0;
  if (hasVideo && video.size > MAX_LISTING_VIDEO_BYTES) return fail("VIDEO_TOO_LARGE", "Видео больше 40 МБ", 413);

  const res = addListing(user.id, {
    title: String(form.get("title") ?? ""),
    description: String(form.get("description") ?? ""),
    price: Math.round(Number(form.get("price"))),
    meal: String(form.get("meal") ?? "") as Meal,
    photo: new Uint8Array(await photo.arrayBuffer()),
    video: hasVideo ? new Uint8Array(await video.arrayBuffer()) : null,
  });
  if (res.ok) return NextResponse.json({ id: res.id }, { status: 201 });
  const map = {
    BAD_TITLE: ["Название — от 2 символов", 400],
    BAD_PRICE: ["Цена — от 10 до 100 000 FC", 400],
    BAD_MEAL: ["Выберите: завтрак, обед или ужин", 400],
    PHOTO_TOO_LARGE: ["Фото больше 8 МБ", 413],
    BAD_PHOTO: ["Фото должно быть в формате JPEG, PNG или WebP", 415],
    VIDEO_TOO_LARGE: ["Видео больше 40 МБ", 413],
    BAD_VIDEO: ["Видео должно быть в формате MP4, MOV или WebM", 415],
    LIMIT_DAY: ["Не больше 10 объявлений в сутки", 429],
  } as const;
  const [message, status] = map[res.code];
  return fail(res.code, message, status);
}
