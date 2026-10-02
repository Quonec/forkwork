/**
 * Общая галерея заведений: фото, которые гости добавили в общий доступ у нас в
 * приложении. Только на сервере.
 *
 * Фото публичные: адрес файла не требует входа, поэтому добавлять их можно
 * только после явного согласия на публикацию и только вошедшим пользователям
 * (не гостям). Клиент перед отправкой пережимает снимок и убирает EXIF (в
 * том числе геометку), сервер проверяет формат по первым байтам. Жалобы
 * скрывают фото: после HIDE_AFTER_REPORTS разных жалоб оно пропадает из
 * списка и счётчика. Автор может удалить своё фото в любой момент.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { db } from "@/lib/db";
import { sniffImageType, type PhotoContentType } from "@/lib/scan/store";

import { venueProvider } from "./data";
import { getOsmVenue } from "./osm";

/** Меняйте вместе с текстом согласия в интерфейсе. */
export const PHOTO_CONSENT_VERSION = "2026-10-02";
export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
export const MAX_PER_USER_PER_VENUE = 5;
export const MAX_PER_USER_PER_DAY = 10;
export const HIDE_AFTER_REPORTS = 3;
export const CAPTION_MAX = 120;

const EXT: Record<PhotoContentType, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const TYPE_BY_EXT: Record<string, PhotoContentType> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
const DIR = path.join(process.cwd(), "data", "public", "venue-photos");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS venue_photos (
  id TEXT PRIMARY KEY,
  venue_key TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_key TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  consent_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'visible',
  reports INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS venue_photos_venue_idx ON venue_photos (venue_key, status, created_at DESC);
CREATE TABLE IF NOT EXISTS venue_photo_reports (
  photo_id TEXT NOT NULL REFERENCES venue_photos(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (photo_id, user_id)
);
`;

let ready = false;
function ensure(): void {
  if (ready) return;
  db.exec(SCHEMA);
  fs.mkdirSync(DIR, { recursive: true });
  ready = true;
}

export type VenuePhoto = { id: string; url: string; caption: string; createdAt: string; author: string; mine: boolean };

/** Заведение должно существовать: избранное или точка из общей базы. */
export function venueExists(key: string): boolean {
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(key)) return false;
  if (venueProvider.listVenues().some((v) => v.id === key)) return true;
  return getOsmVenue(key) !== null;
}

type Row = { id: string; venue_key: string; user_id: number; file_key: string; caption: string; created_at: string; name: string | null };

const firstName = (name: string | null): string => (name ?? "").trim().split(/\s+/)[0] || "Гость";

export function listPhotos(venueKey: string, viewerId: number | null, limit = 24): { count: number; photos: VenuePhoto[] } {
  ensure();
  const count = (db.prepare("SELECT COUNT(*) AS n FROM venue_photos WHERE venue_key = ? AND status = 'visible'").get(venueKey) as { n: number }).n;
  const rows = db
    .prepare(
      "SELECT p.*, u.name FROM venue_photos p LEFT JOIN users u ON u.id = p.user_id WHERE p.venue_key = ? AND p.status = 'visible' ORDER BY p.created_at DESC LIMIT ?",
    )
    .all(venueKey, limit) as unknown as Row[];
  return {
    count,
    photos: rows.map((r) => ({
      id: r.id,
      url: `/api/venues/photos/${r.id}`,
      caption: r.caption,
      createdAt: r.created_at,
      author: firstName(r.name),
      mine: viewerId !== null && r.user_id === viewerId,
    })),
  };
}

/** Сколько фото у каждого заведения, у которого они есть. */
export function photoCounts(): Record<string, number> {
  ensure();
  const rows = db.prepare("SELECT venue_key AS k, COUNT(*) AS n FROM venue_photos WHERE status = 'visible' GROUP BY venue_key").all() as unknown as { k: string; n: number }[];
  return Object.fromEntries(rows.map((r) => [r.k, r.n]));
}

export type AddResult = { ok: true; photo: { id: string } } | { ok: false; code: "VENUE_UNKNOWN" | "TOO_LARGE" | "BAD_IMAGE" | "LIMIT_VENUE" | "LIMIT_DAY" };

export function addPhoto(userId: number, venueKey: string, bytes: Uint8Array, caption: string): AddResult {
  ensure();
  if (!venueExists(venueKey)) return { ok: false, code: "VENUE_UNKNOWN" };
  if (bytes.length > MAX_PHOTO_BYTES) return { ok: false, code: "TOO_LARGE" };
  const type = sniffImageType(bytes);
  if (!type) return { ok: false, code: "BAD_IMAGE" };
  const perVenue = (db.prepare("SELECT COUNT(*) AS n FROM venue_photos WHERE user_id = ? AND venue_key = ? AND status != 'deleted'").get(userId, venueKey) as { n: number }).n;
  if (perVenue >= MAX_PER_USER_PER_VENUE) return { ok: false, code: "LIMIT_VENUE" };
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const perDay = (db.prepare("SELECT COUNT(*) AS n FROM venue_photos WHERE user_id = ? AND created_at > ?").get(userId, since) as { n: number }).n;
  if (perDay >= MAX_PER_USER_PER_DAY) return { ok: false, code: "LIMIT_DAY" };
  const id = crypto.randomUUID();
  const fileKey = `${id}.${EXT[type]}`;
  fs.writeFileSync(path.join(DIR, fileKey), bytes);
  db.prepare("INSERT INTO venue_photos (id, venue_key, user_id, file_key, caption, consent_version, created_at) VALUES (?,?,?,?,?,?,?)").run(
    id,
    venueKey,
    userId,
    fileKey,
    caption.trim().slice(0, CAPTION_MAX),
    PHOTO_CONSENT_VERSION,
    new Date().toISOString(),
  );
  return { ok: true, photo: { id } };
}

export function readPhoto(id: string): { bytes: Buffer; contentType: PhotoContentType } | null {
  ensure();
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const row = db.prepare("SELECT file_key FROM venue_photos WHERE id = ? AND status = 'visible'").get(id) as { file_key: string } | undefined;
  if (!row) return null;
  const contentType = TYPE_BY_EXT[path.extname(row.file_key).slice(1)];
  if (!contentType) return null;
  try {
    return { bytes: fs.readFileSync(path.join(DIR, path.basename(row.file_key))), contentType };
  } catch {
    return null;
  }
}

/** Автор удаляет своё фото вместе с файлом. */
export function deletePhoto(userId: number, id: string): boolean {
  ensure();
  const row = db.prepare("SELECT file_key FROM venue_photos WHERE id = ? AND user_id = ?").get(id, userId) as { file_key: string } | undefined;
  if (!row) return false;
  try {
    fs.unlinkSync(path.join(DIR, path.basename(row.file_key)));
  } catch {
    /* файла уже нет */
  }
  db.prepare("DELETE FROM venue_photos WHERE id = ?").run(id);
  return true;
}

/** Жалоба на фото: одна от человека; набрав порог, фото скрывается. */
export function reportPhoto(userId: number, id: string): "reported" | "hidden" | "missing" | "own" {
  ensure();
  const row = db.prepare("SELECT user_id, status FROM venue_photos WHERE id = ?").get(id) as { user_id: number; status: string } | undefined;
  if (!row || row.status !== "visible") return "missing";
  if (row.user_id === userId) return "own";
  const ins = db.prepare("INSERT OR IGNORE INTO venue_photo_reports (photo_id, user_id, created_at) VALUES (?,?,?)").run(id, userId, new Date().toISOString());
  if (Number(ins.changes) > 0) {
    db.prepare("UPDATE venue_photos SET reports = reports + 1 WHERE id = ?").run(id);
    const n = (db.prepare("SELECT reports FROM venue_photos WHERE id = ?").get(id) as { reports: number }).reports;
    if (n >= HIDE_AFTER_REPORTS) {
      db.prepare("UPDATE venue_photos SET status = 'hidden' WHERE id = ?").run(id);
      return "hidden";
    }
  }
  return "reported";
}
