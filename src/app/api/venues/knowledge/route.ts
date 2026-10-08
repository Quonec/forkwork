import { knowledgeBrief } from "@/lib/venues/assistant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Сжатая база знаний о заведениях (описание, меню тезисами, критики, отзывы гостей) для контекста ИИ-помощника. */
export async function GET() {
  return new Response(knowledgeBrief(), { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
}
