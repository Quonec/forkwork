/**
 * «Продать блюдо»: любой вошедший пользователь выставляет своё блюдо плиткой с фото и (по желанию) видео.
 * Файлы лежат в постоянном каталоге данных (DATA_DIR/uploads/listings), формат проверяется по первым байтам.
 * Только на сервере.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { DATA_DIR, db } from "@/lib/db";
import { sniffImageType, type PhotoContentType } from "@/lib/scan/store";
import { type Meal } from "@/lib/meal";

export const MAX_LISTING_PHOTO_BYTES = 8 * 1024 * 1024;
export const MAX_LISTING_VIDEO_BYTES = 40 * 1024 * 1024;
export const MAX_LISTINGS_PER_DAY = 10;
export const TITLE_MAX = 80;
export const DESC_MAX = 400;

type VideoContentType = "video/mp4" | "video/webm" | "video/quicktime";
const EXT: Record<PhotoContentType | VideoContentType, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
  "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
};
const TYPE_BY_EXT: Record<string, PhotoContentType | VideoContentType> = Object.fromEntries(Object.entries(EXT).map(([t, e]) => [e, t])) as never;
const DIR = path.join(DATA_DIR, "uploads", "listings");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS listings (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL,
  meal TEXT NOT NULL,
  photo_key TEXT NOT NULL,
  video_key TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS listings_status_idx ON listings (status, created_at DESC);
`;

let ready = false;
function ensure(): void {
  if (ready) return;
  db.exec(SCHEMA);
  fs.mkdirSync(DIR, { recursive: true });
  ready = true;
}

/** Видео по первым байтам: MP4/MOV (ftyp на 4-м байте) или WebM (EBML). */
export function sniffVideoType(b: Uint8Array): VideoContentType | null {
  if (b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = String.fromCharCode(b[8]!, b[9]!, b[10]!, b[11]!);
    return brand === "qt  " ? "video/quicktime" : "video/mp4";
  }
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "video/webm";
  return null;
}

export type Listing = {
  id: string;
  title: string;
  description: string;
  price: number;
  meal: Meal;
  photoUrl: string;
  videoUrl: string | null;
  seller: string;
  createdAt: string;
  mine: boolean;
};

type Row = { id: string; user_id: number; title: string; description: string; price: number; meal: Meal; video_key: string | null; created_at: string; seller: string };

const toListing = (r: Row, viewerId: number | null): Listing => ({
  id: r.id,
  title: r.title,
  description: r.description,
  price: r.price,
  meal: r.meal,
  photoUrl: `/api/listings/${r.id}/photo`,
  videoUrl: r.video_key ? `/api/listings/${r.id}/video` : null,
  seller: r.seller,
  createdAt: r.created_at,
  mine: viewerId !== null && r.user_id === viewerId,
});

export function listListings(viewerId: number | null, opts: { mine?: boolean; limit?: number } = {}): Listing[] {
  ensure();
  const limit = Math.min(Math.max(opts.limit ?? 48, 1), 200);
  const rows = (opts.mine
    ? db.prepare(`SELECT l.*, u.name AS seller FROM listings l JOIN users u ON u.id = l.user_id WHERE l.user_id = ? AND l.status = 'active' ORDER BY l.created_at DESC LIMIT ?`).all(viewerId ?? -1, limit)
    : db.prepare(`SELECT l.*, u.name AS seller FROM listings l JOIN users u ON u.id = l.user_id WHERE l.status = 'active' AND u.blocked = 0 ORDER BY l.created_at DESC LIMIT ?`).all(limit)) as unknown as Row[];
  return rows.map((r) => toListing(r, viewerId));
}

export type AddListingInput = { title: string; description: string; price: number; meal: Meal; photo: Uint8Array; video: Uint8Array | null };
export type AddListingResult =
  | { ok: true; id: string }
  | { ok: false; code: "BAD_TITLE" | "BAD_PRICE" | "BAD_MEAL" | "PHOTO_TOO_LARGE" | "BAD_PHOTO" | "VIDEO_TOO_LARGE" | "BAD_VIDEO" | "LIMIT_DAY" };

export function addListing(userId: number, input: AddListingInput): AddListingResult {
  ensure();
  const title = input.title.trim().slice(0, TITLE_MAX);
  if (title.length < 2) return { ok: false, code: "BAD_TITLE" };
  if (!Number.isInteger(input.price) || input.price < 10 || input.price > 100_000) return { ok: false, code: "BAD_PRICE" };
  if (!["breakfast", "lunch", "dinner"].includes(input.meal)) return { ok: false, code: "BAD_MEAL" };
  if (input.photo.length > MAX_LISTING_PHOTO_BYTES) return { ok: false, code: "PHOTO_TOO_LARGE" };
  const photoType = sniffImageType(input.photo);
  if (!photoType) return { ok: false, code: "BAD_PHOTO" };
  let videoType: VideoContentType | null = null;
  if (input.video) {
    if (input.video.length > MAX_LISTING_VIDEO_BYTES) return { ok: false, code: "VIDEO_TOO_LARGE" };
    videoType = sniffVideoType(input.video);
    if (!videoType) return { ok: false, code: "BAD_VIDEO" };
  }
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const perDay = (db.prepare("SELECT COUNT(*) AS n FROM listings WHERE user_id = ? AND created_at > ?").get(userId, since) as { n: number }).n;
  if (perDay >= MAX_LISTINGS_PER_DAY) return { ok: false, code: "LIMIT_DAY" };

  const id = crypto.randomUUID();
  const photoKey = `${id}-photo.${EXT[photoType]}`;
  const videoKey = videoType ? `${id}-video.${EXT[videoType]}` : null;
  fs.writeFileSync(path.join(DIR, photoKey), input.photo);
  if (videoKey && input.video) fs.writeFileSync(path.join(DIR, videoKey), input.video);
  db.prepare("INSERT INTO listings (id, user_id, title, description, price, meal, photo_key, video_key, created_at) VALUES (?,?,?,?,?,?,?,?,?)").run(
    id, userId, title, input.description.trim().slice(0, DESC_MAX), input.price, input.meal, photoKey, videoKey, new Date().toISOString(),
  );
  return { ok: true, id };
}

/** Путь и тип файла объявления (фото или видео) для отдачи. */
export function listingFile(id: string, kind: "photo" | "video"): { file: string; size: number; contentType: string } | null {
  ensure();
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const row = db.prepare("SELECT photo_key, video_key FROM listings WHERE id = ? AND status = 'active'").get(id) as { photo_key: string; video_key: string | null } | undefined;
  const key = kind === "photo" ? row?.photo_key : row?.video_key;
  if (!key) return null;
  const contentType = TYPE_BY_EXT[path.extname(key).slice(1)];
  const file = path.join(DIR, path.basename(key));
  try {
    return { file, size: fs.statSync(file).size, contentType: contentType ?? "application/octet-stream" };
  } catch {
    return null;
  }
}

/** Автор снимает объявление: запись и файлы удаляются. */
export function deleteListing(userId: number, id: string): boolean {
  ensure();
  const row = db.prepare("SELECT photo_key, video_key FROM listings WHERE id = ? AND user_id = ?").get(id, userId) as { photo_key: string; video_key: string | null } | undefined;
  if (!row) return false;
  for (const k of [row.photo_key, row.video_key]) {
    if (!k) continue;
    try {
      fs.unlinkSync(path.join(DIR, path.basename(k)));
    } catch {
      /* файла уже нет */
    }
  }
  db.prepare("DELETE FROM listings WHERE id = ?").run(id);
  return true;
}
