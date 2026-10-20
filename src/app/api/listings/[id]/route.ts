import { isResponse, requireUser } from "@/lib/api";
import { deleteListing } from "@/lib/listings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Автор снимает своё объявление вместе с файлами. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await params;
  return deleteListing(user.id, id) ? new Response(null, { status: 204 }) : new Response(null, { status: 404 });
}
