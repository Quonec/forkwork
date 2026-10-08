/**
 * The scanner's storage — the ONLY module that touches the `scans`,
 * `scan_items` and `scan_consents` tables and the private photo folder.
 * Server-only.
 *
 * Every read/write takes `ownerId` (the session user, never a request field)
 * first; a scan that is not the owner's answers exactly like a missing one.
 * The stored basis is per 100 g (integer kcal, integer mg); per-portion values
 * are derived at read time. A photo lives in `data/private/scans/<id>.<ext>`
 * — no public URL, served only through the owner-checked photo route.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { db } from "@/lib/db";

import type { ScanItemView, ScanListRow, ScanStatus, ScanView } from "./events";
import { scaleTo } from "./nutrition";
import { SCAN_PHOTO_RETENTION_DAYS, UNFINISHED_SCAN_TTL_HOURS, photoExpiresAt } from "./retention";
import type { LabelledDish } from "./label";
import type { DiaryScan } from "./diary";
import { GUEST_EMAIL_DOMAIN, GUEST_RETENTION_DAYS } from "@/lib/guest";

/** Bump together with the consent text on /scan. */
export const SCAN_CONSENT_VERSION = "2026-09-30";

export type PhotoContentType = "image/jpeg" | "image/png" | "image/webp";
const EXT: Record<PhotoContentType, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const TYPE_BY_EXT: Record<string, PhotoContentType> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

const PRIVATE_DIR = path.join(process.cwd(), "data", "private", "scans");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS scans (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'analyzing',
  provider TEXT NOT NULL,
  confidence TEXT,
  photo_key TEXT,
  photo_expires_at TEXT,
  error_code TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS scans_user_created_idx ON scans (user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS scan_items (
  id TEXT PRIMARY KEY,
  scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  estimated_grams INTEGER NOT NULL,
  grams INTEGER NOT NULL CHECK (grams BETWEEN 1 AND 5000),
  kcal_per_100g INTEGER NOT NULL CHECK (kcal_per_100g BETWEEN 0 AND 950),
  protein_mg_per_100g INTEGER NOT NULL CHECK (protein_mg_per_100g >= 0),
  fat_mg_per_100g INTEGER NOT NULL CHECK (fat_mg_per_100g >= 0),
  carbs_mg_per_100g INTEGER NOT NULL CHECK (carbs_mg_per_100g >= 0),
  source TEXT NOT NULL,
  reference_name TEXT,
  confidence TEXT NOT NULL,
  bbox_x INTEGER,
  bbox_y INTEGER,
  edited_at TEXT
);
CREATE INDEX IF NOT EXISTS scan_items_scan_idx ON scan_items (scan_id, position);
CREATE TABLE IF NOT EXISTS scan_consents (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  accepted_at TEXT NOT NULL,
  PRIMARY KEY (user_id, version)
);
`;

function ensureSchema(): void {
  const g = globalThis as unknown as { __scanSchema?: boolean };
  if (g.__scanSchema) return;
  db.exec(SCHEMA);
  g.__scanSchema = true;
}

const now = () => new Date().toISOString();

// ── consent ─────────────────────────────────────────────────────────────────

export function hasScanConsent(ownerId: number): boolean {
  ensureSchema();
  return !!db.prepare("SELECT 1 FROM scan_consents WHERE user_id = ? AND version = ?").get(ownerId, SCAN_CONSENT_VERSION);
}

export function recordScanConsent(ownerId: number): void {
  ensureSchema();
  db.prepare("INSERT OR IGNORE INTO scan_consents (user_id, version, accepted_at) VALUES (?,?,?)").run(
    ownerId,
    SCAN_CONSENT_VERSION,
    now(),
  );
}

// ── daily budget ────────────────────────────────────────────────────────────

export function countScansToday(ownerId: number): number {
  ensureSchema();
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM scans WHERE user_id = ? AND created_at >= ?")
    .get(ownerId, start.toISOString()) as { n: number };
  return row.n;
}

// ── photo files ─────────────────────────────────────────────────────────────

function photoPath(key: string): string {
  return path.join(PRIVATE_DIR, path.basename(key));
}

function removeFile(key: string | null): void {
  if (!key) return;
  try {
    fs.rmSync(photoPath(key), { force: true });
  } catch (e) {
    console.error(`[scan] could not delete a photo file: ${(e as Error).message}`);
  }
}

/** The sniffed type of the bytes (magic numbers), or null when it is not jpeg / png / webp. */
export function sniffImageType(bytes: Uint8Array): PhotoContentType | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  const riff = String.fromCharCode(...bytes.subarray(0, 4));
  const webp = String.fromCharCode(...bytes.subarray(8, 12));
  if (riff === "RIFF" && webp === "WEBP") return "image/webp";
  return null;
}

// ── writes ──────────────────────────────────────────────────────────────────

export function createScan(ownerId: number, provider: string, image: Uint8Array, contentType: PhotoContentType): string {
  ensureSchema();
  const id = crypto.randomUUID();
  const t = new Date();
  const key = `${id}.${EXT[contentType]}`;
  fs.mkdirSync(PRIVATE_DIR, { recursive: true });
  fs.writeFileSync(photoPath(key), image);
  try {
    db.prepare(
      `INSERT INTO scans (id, user_id, status, provider, photo_key, photo_expires_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?)`,
    ).run(id, ownerId, "analyzing", provider, key, photoExpiresAt(t).toISOString(), t.toISOString(), t.toISOString());
  } catch (e) {
    removeFile(key);
    throw e;
  }
  return id;
}

/** The terminal write for a scan that ends without a result; a compare-and-set on `analyzing`. */
export function endWithoutResult(scanId: string, status: "no_food" | "failed" | "cancelled", errorCode: string | null): boolean {
  ensureSchema();
  const row = db.prepare("SELECT photo_key FROM scans WHERE id = ? AND status = 'analyzing'").get(scanId) as
    | { photo_key: string | null }
    | undefined;
  if (!row) return false;
  const t = now();
  const res = db
    .prepare(
      `UPDATE scans SET status = ?, error_code = ?, photo_key = NULL, photo_expires_at = NULL, completed_at = ?, updated_at = ?
       WHERE id = ? AND status = 'analyzing'`,
    )
    .run(status, errorCode, t, t, scanId);
  if (Number(res.changes) === 0) return false;
  removeFile(row.photo_key);
  return true;
}

export type NewScanItem = { id: string; dish: LabelledDish; grams: number };

/** One transaction: claim the scan (`analyzing` → `done`) and write its items. */
export function completeScan(scanId: string, confidence: string, items: NewScanItem[]): void {
  ensureSchema();
  const t = now();
  db.exec("BEGIN IMMEDIATE");
  try {
    const res = db
      .prepare("UPDATE scans SET status = 'done', confidence = ?, completed_at = ?, updated_at = ? WHERE id = ? AND status = 'analyzing'")
      .run(confidence, t, t, scanId);
    if (Number(res.changes) === 0) throw new Error("SCAN_GONE");
    const ins = db.prepare(
      `INSERT INTO scan_items (id, scan_id, position, name, estimated_grams, grams, kcal_per_100g, protein_mg_per_100g,
         fat_mg_per_100g, carbs_mg_per_100g, source, reference_name, confidence, bbox_x, bbox_y)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    items.forEach(({ id, dish, grams }, position) => {
      ins.run(
        id,
        scanId,
        position,
        dish.name,
        Math.round(dish.grams),
        grams,
        dish.per100g.kcal,
        dish.per100g.proteinMg,
        dish.per100g.fatMg,
        dish.per100g.carbsMg,
        dish.source,
        dish.referenceName,
        dish.confidence,
        dish.bbox?.x ?? null,
        dish.bbox?.y ?? null,
      );
    });
    db.exec("COMMIT");
  } catch (e) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    throw e;
  }
}

export function updateItemGrams(ownerId: number, scanId: string, itemId: string, grams: number): boolean {
  ensureSchema();
  const res = db
    .prepare(
      `UPDATE scan_items SET grams = ?, edited_at = ?
       WHERE id = ? AND scan_id = ? AND EXISTS (SELECT 1 FROM scans s WHERE s.id = ? AND s.user_id = ? AND s.status = 'done')`,
    )
    .run(grams, now(), itemId, scanId, scanId, ownerId);
  return Number(res.changes) > 0;
}

export function deleteScanForOwner(ownerId: number, scanId: string): boolean {
  ensureSchema();
  const row = db.prepare("SELECT photo_key FROM scans WHERE id = ? AND user_id = ?").get(scanId, ownerId) as
    | { photo_key: string | null }
    | undefined;
  if (!row) return false;
  db.prepare("DELETE FROM scans WHERE id = ? AND user_id = ?").run(scanId, ownerId);
  removeFile(row.photo_key);
  return true;
}

// ── reads ───────────────────────────────────────────────────────────────────

type ScanRow = {
  id: string;
  status: ScanStatus;
  provider: string;
  confidence: string | null;
  photo_key: string | null;
  photo_expires_at: string | null;
  completed_at: string | null;
  created_at: string;
};

type ItemRow = {
  id: string;
  position: number;
  name: string;
  estimated_grams: number;
  grams: number;
  kcal_per_100g: number;
  protein_mg_per_100g: number;
  fat_mg_per_100g: number;
  carbs_mg_per_100g: number;
  source: "reference" | "ai";
  reference_name: string | null;
  confidence: string;
  bbox_x: number | null;
  bbox_y: number | null;
  edited_at: string | null;
};

function toItemView(r: ItemRow): ScanItemView {
  const per100g = {
    kcal: r.kcal_per_100g,
    proteinMg: r.protein_mg_per_100g,
    fatMg: r.fat_mg_per_100g,
    carbsMg: r.carbs_mg_per_100g,
  };
  return {
    id: r.id,
    position: r.position,
    name: r.name,
    grams: r.grams,
    estimatedGrams: r.estimated_grams,
    edited: r.edited_at !== null,
    source: r.source,
    confidence: r.confidence,
    referenceName: r.reference_name,
    bbox: r.bbox_x !== null && r.bbox_y !== null ? { x: r.bbox_x, y: r.bbox_y } : null,
    per100g,
    perPortion: {
      kcal: scaleTo(per100g.kcal, r.grams),
      proteinMg: scaleTo(per100g.proteinMg, r.grams),
      fatMg: scaleTo(per100g.fatMg, r.grams),
      carbsMg: scaleTo(per100g.carbsMg, r.grams),
    },
  };
}

export function getScanForOwner(ownerId: number, scanId: string): ScanView | null {
  ensureSchema();
  const s = db
    .prepare(
      `SELECT id, status, provider, confidence, photo_key, photo_expires_at, completed_at, created_at
       FROM scans WHERE id = ? AND user_id = ?`,
    )
    .get(scanId, ownerId) as ScanRow | undefined;
  if (!s) return null;
  const items = (
    db.prepare("SELECT * FROM scan_items WHERE scan_id = ? ORDER BY position").all(scanId) as ItemRow[]
  ).map(toItemView);
  const total = items.reduce(
    (a, i) => ({
      grams: a.grams + i.grams,
      kcal: a.kcal + i.perPortion.kcal,
      proteinMg: a.proteinMg + i.perPortion.proteinMg,
      fatMg: a.fatMg + i.perPortion.fatMg,
      carbsMg: a.carbsMg + i.perPortion.carbsMg,
    }),
    { grams: 0, kcal: 0, proteinMg: 0, fatMg: 0, carbsMg: 0 },
  );
  return {
    id: s.id,
    status: s.status,
    createdAt: s.created_at,
    completedAt: s.completed_at,
    confidence: s.confidence,
    provider: s.provider,
    photo: { available: s.photo_key !== null, expiresAt: s.photo_expires_at },
    items,
    total,
  };
}

export function listScansForOwner(ownerId: number, limit: number, offset: number): ScanListRow[] {
  ensureSchema();
  const rows = db
    .prepare(
      `SELECT id, status, created_at, photo_key FROM scans
       WHERE user_id = ? AND status = 'done' ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    )
    .all(ownerId, limit, offset) as { id: string; status: ScanStatus; created_at: string; photo_key: string | null }[];
  const itemsStmt = db.prepare("SELECT name, grams, kcal_per_100g FROM scan_items WHERE scan_id = ? ORDER BY position");
  return rows.map((r) => {
    const items = itemsStmt.all(r.id) as { name: string; grams: number; kcal_per_100g: number }[];
    return {
      id: r.id,
      createdAt: r.created_at,
      status: r.status,
      thumb: { available: r.photo_key !== null },
      headline: items[0]?.name ?? null,
      moreCount: Math.max(0, items.length - 1),
      totalKcal: items.reduce((sum, i) => sum + scaleTo(i.kcal_per_100g, i.grams), 0),
    };
  });
}

/** The owner's finished scans created in [fromIso, toIso), oldest first, each with its portion totals (the weekly diary's rows). */
export function listDoneScansInRange(ownerId: number, fromIso: string, toIso: string): DiaryScan[] {
  ensureSchema();
  const rows = db
    .prepare(
      `SELECT id, created_at, photo_key FROM scans
       WHERE user_id = ? AND status = 'done' AND created_at >= ? AND created_at < ? ORDER BY created_at`,
    )
    .all(ownerId, fromIso, toIso) as unknown as { id: string; created_at: string; photo_key: string | null }[];
  const itemsStmt = db.prepare(
    `SELECT name, grams, kcal_per_100g, protein_mg_per_100g, fat_mg_per_100g, carbs_mg_per_100g
     FROM scan_items WHERE scan_id = ? ORDER BY position`,
  );
  return rows.map((r) => {
    const items = itemsStmt.all(r.id) as unknown as {
      name: string;
      grams: number;
      kcal_per_100g: number;
      protein_mg_per_100g: number;
      fat_mg_per_100g: number;
      carbs_mg_per_100g: number;
    }[];
    const sum = (pick: (i: (typeof items)[number]) => number) => items.reduce((a, i) => a + scaleTo(pick(i), i.grams), 0);
    return {
      id: r.id,
      createdAt: r.created_at,
      thumb: r.photo_key !== null,
      headline: items[0]?.name ?? null,
      moreCount: Math.max(0, items.length - 1),
      grams: items.reduce((a, i) => a + i.grams, 0),
      kcal: sum((i) => i.kcal_per_100g),
      proteinMg: sum((i) => i.protein_mg_per_100g),
      fatMg: sum((i) => i.fat_mg_per_100g),
      carbsMg: sum((i) => i.carbs_mg_per_100g),
    };
  });
}

export function readPhotoForOwner(ownerId: number, scanId: string): { bytes: Buffer; contentType: PhotoContentType } | null {
  ensureSchema();
  const row = db.prepare("SELECT photo_key FROM scans WHERE id = ? AND user_id = ?").get(scanId, ownerId) as
    | { photo_key: string | null }
    | undefined;
  if (!row?.photo_key) return null;
  const ext = path.extname(row.photo_key).slice(1);
  const contentType = TYPE_BY_EXT[ext];
  if (!contentType) return null;
  try {
    return { bytes: fs.readFileSync(photoPath(row.photo_key)), contentType };
  } catch {
    return null;
  }
}

// ── retention ───────────────────────────────────────────────────────────────

/** Deletes photos past their retention (the estimate stays) and unfinished scans older than the TTL. Cheap; call it opportunistically. */
export function sweepScans(): void {
  ensureSchema();
  const t = now();
  const expired = db
    .prepare("SELECT id, photo_key FROM scans WHERE photo_key IS NOT NULL AND photo_expires_at IS NOT NULL AND photo_expires_at < ?")
    .all(t) as { id: string; photo_key: string }[];
  for (const r of expired) {
    db.prepare("UPDATE scans SET photo_key = NULL, photo_expires_at = NULL, updated_at = ? WHERE id = ?").run(t, r.id);
    removeFile(r.photo_key);
  }
  const cutoff = new Date(Date.now() - UNFINISHED_SCAN_TTL_HOURS * 3_600_000).toISOString();
  const stale = db
    .prepare("SELECT id, photo_key FROM scans WHERE status != 'done' AND created_at < ?")
    .all(cutoff) as { id: string; photo_key: string | null }[];
  for (const r of stale) {
    db.prepare("DELETE FROM scans WHERE id = ?").run(r.id);
    removeFile(r.photo_key);
  }
}

export { SCAN_PHOTO_RETENTION_DAYS };

// ── guests ──────────────────────────────────────────────────────────────────

/** Scans a guest has spent: finished ones and the one in flight (a failed or no-food try is free). */
export function guestScansUsed(ownerId: number): number {
  ensureSchema();
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM scans WHERE user_id = ? AND status IN ('done','analyzing')")
    .get(ownerId) as { n: number };
  return row.n;
}

export function lastDoneScanId(ownerId: number): string | null {
  ensureSchema();
  const row = db
    .prepare("SELECT id FROM scans WHERE user_id = ? AND status = 'done' ORDER BY created_at DESC LIMIT 1")
    .get(ownerId) as { id: string } | undefined;
  return row?.id ?? null;
}

/** Removes guest accounts older than the retention window, with their scans and photos. */
export function sweepGuests(): void {
  ensureSchema();
  const cutoff = new Date(Date.now() - GUEST_RETENTION_DAYS * 86_400_000).toISOString();
  const guests = db
    .prepare("SELECT id FROM users WHERE email LIKE ? AND created_at < ?")
    .all(`%@${GUEST_EMAIL_DOMAIN}`, cutoff) as unknown as { id: number }[];
  for (const g of guests) {
    const photos = db.prepare("SELECT photo_key FROM scans WHERE user_id = ?").all(g.id) as unknown as { photo_key: string | null }[];
    for (const p of photos) removeFile(p.photo_key);
    db.prepare("DELETE FROM scans WHERE user_id = ?").run(g.id);
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(g.id);
    db.prepare("DELETE FROM scan_consents WHERE user_id = ?").run(g.id);
    db.prepare("DELETE FROM users WHERE id = ?").run(g.id);
  }
}
