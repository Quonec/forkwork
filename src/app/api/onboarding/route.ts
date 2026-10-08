import { db } from "@/lib/db";
import { json, requireUser, isResponse } from "@/lib/api";

export async function POST() {
  const user = await requireUser();
  if (isResponse(user)) return user;
  db.prepare("UPDATE users SET onboarded = 1 WHERE id = ?").run(user.id);
  return json({ ok: true });
}
