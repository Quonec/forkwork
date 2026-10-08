import { isResponse, json, err, requireUser } from "@/lib/api";
import { cleanNoteText, deleteNote, updateNote } from "@/lib/notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { text?: unknown } | null;
  const text = cleanNoteText(body?.text);
  if (!text) return err("Заметка: от 1 до 2000 символов", 400);
  const note = updateNote(user.id, id, text);
  if (!note) return err("Заметка не найдена", 404);
  return json({ note });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await params;
  if (!deleteNote(user.id, id)) return err("Заметка не найдена", 404);
  return json({ ok: true });
}
