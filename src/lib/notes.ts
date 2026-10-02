import crypto from "node:crypto";

import { db } from "@/lib/db";

export type Note = { id: string; text: string; createdAt: string; updatedAt: string };

export const NOTE_MAX = 2000;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS user_notes (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS user_notes_user_idx ON user_notes (user_id, updated_at DESC);
`;

function ensureSchema(): void {
  const g = globalThis as unknown as { __notesSchema?: boolean };
  if (g.__notesSchema) return;
  db.exec(SCHEMA);
  g.__notesSchema = true;
}

type Row = { id: string; text: string; created_at: string; updated_at: string };
const toNote = (r: Row): Note => ({ id: r.id, text: r.text, createdAt: r.created_at, updatedAt: r.updated_at });

export function listNotes(userId: number): Note[] {
  ensureSchema();
  return (
    db.prepare("SELECT id, text, created_at, updated_at FROM user_notes WHERE user_id = ? ORDER BY updated_at DESC").all(userId) as unknown as Row[]
  ).map(toNote);
}

export function createNote(userId: number, text: string): Note {
  ensureSchema();
  const id = crypto.randomUUID();
  const t = new Date().toISOString();
  db.prepare("INSERT INTO user_notes (id, user_id, text, created_at, updated_at) VALUES (?,?,?,?,?)").run(id, userId, text, t, t);
  return { id, text, createdAt: t, updatedAt: t };
}

export function updateNote(userId: number, id: string, text: string): Note | null {
  ensureSchema();
  const t = new Date().toISOString();
  const res = db.prepare("UPDATE user_notes SET text = ?, updated_at = ? WHERE id = ? AND user_id = ?").run(text, t, id, userId);
  if (Number(res.changes) === 0) return null;
  const row = db.prepare("SELECT id, text, created_at, updated_at FROM user_notes WHERE id = ? AND user_id = ?").get(id, userId) as unknown as Row;
  return toNote(row);
}

export function deleteNote(userId: number, id: string): boolean {
  ensureSchema();
  return Number(db.prepare("DELETE FROM user_notes WHERE id = ? AND user_id = ?").run(id, userId).changes) > 0;
}

/** A trimmed note text within bounds, or null. */
export function cleanNoteText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  return text.length > 0 && text.length <= NOTE_MAX ? text : null;
}
