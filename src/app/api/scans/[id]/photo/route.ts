import { isResponse, requireScanUser } from "@/lib/api";
import { readPhotoForOwner } from "@/lib/scan/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireScanUser();
  if (isResponse(user)) return user;
  const { id } = await params;
  const photo = readPhotoForOwner(user.id, id);
  if (!photo) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(photo.bytes), {
    headers: {
      "Content-Type": photo.contentType,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
