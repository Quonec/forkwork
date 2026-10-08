import { json } from "@/lib/api";
import { listStreams } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** Идёт ли сейчас эфир: число эфиров и самый смотрибельный (для красной точки на экране). */
export async function GET() {
  const live = listStreams()
    .filter((s) => s.status === "live")
    .sort((a, b) => b.viewers - a.viewers);
  const top = live[0];
  return json({ live: live.length, top: top ? { id: top.id, title: top.title, chefName: top.chefName ?? "" } : null });
}
