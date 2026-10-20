import fs from "node:fs";
import { Readable } from "node:stream";

import { listingFile } from "@/lib/listings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Фото или видео объявления: публичные, без входа. Видео отдаётся кусками (Range), чтобы плеер мог перематывать. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; kind: string }> }) {
  const { id, kind } = await params;
  if (kind !== "photo" && kind !== "video") return new Response(null, { status: 404 });
  const f = listingFile(id, kind);
  if (!f) return new Response(null, { status: 404 });
  const base = { "Content-Type": f.contentType, "Cache-Control": "public, max-age=3600", "X-Content-Type-Options": "nosniff", "Accept-Ranges": "bytes" };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : Math.max(0, f.size - Number(range[2]));
    let end = range[1] && range[2] ? Number(range[2]) : f.size - 1;
    end = Math.min(end, f.size - 1);
    if (start > end || start >= f.size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${f.size}` } });
    start = Math.max(0, start);
    const stream = Readable.toWeb(fs.createReadStream(f.file, { start, end })) as ReadableStream;
    return new Response(stream, { status: 206, headers: { ...base, "Content-Range": `bytes ${start}-${end}/${f.size}`, "Content-Length": String(end - start + 1) } });
  }
  const stream = Readable.toWeb(fs.createReadStream(f.file)) as ReadableStream;
  return new Response(stream, { headers: { ...base, "Content-Length": String(f.size) } });
}
