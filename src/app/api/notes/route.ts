import { isResponse, json, err, requireUser } from "@/lib/api";
import { cleanNoteText, createNote, listNotes } from "@/lib/notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireUser();
  if (isResponse(user)) return user;
  return json({ notes: listNotes(user.id) });
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const body = (await req.json().catch(() => null)) as { text?: unknown } | null;
  const text = cleanNoteText(body?.text);
  if (!text) return err("Заметка: от 1 до 2000 символов", 400);
  return json({ note: createNote(user.id, text) }, 201);
}
