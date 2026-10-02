import { isResponse, requireUser } from "@/lib/api";
import { deletePhoto, readPhoto } from "@/lib/venues/photos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Файл фото из общей галереи: публичный, поэтому без входа. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const photo = readPhoto(id);
  if (!photo) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(photo.bytes), {
    headers: { "Content-Type": photo.contentType, "Cache-Control": "public, max-age=3600", "X-Content-Type-Options": "nosniff" },
  });
}

/** Автор удаляет своё фото. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await params;
  return deletePhoto(user.id, id) ? new Response(null, { status: 204 }) : new Response(null, { status: 404 });
}
