/**
 * The photo as the scanner uploads it (legacy `api.js` compressImage, spec
 * Part 6.2): decoded with its EXIF orientation applied, drawn onto a canvas
 * at ≤ 1280 px on the long side and re-encoded as JPEG 0.85 — the re-encode
 * is what drops EXIF (GPS, the device) before a byte leaves the phone — plus
 * a 160 px thumb the same way. Each canvas is released at once (width =
 * height = 0: an older iPhone otherwise keeps megabytes of pixels alive
 * across scans).
 *
 * A photo this browser cannot decode is sent as it is when the server would
 * accept it anyway (jpeg / png / webp ≤ 5 MB); otherwise `null` — the lens
 * says «Не получилось открыть фото — выберите другое».
 *
 * `originalSha256` is the sha256 of the file AS PICKED, before any re-encode
 * (64 lowercase hex), sent next to the photo: the re-encode changes every
 * byte, and the stub recognizer pins its seed fixtures (plov.webp → «Плов с
 * мясом») by the original file. Never stored by the server. `null` where the
 * browser has no Web Crypto (a plain-http page that is not localhost) — the
 * scan goes out without it.
 */
export type ScanUpload = { photo: File; thumb: File | null; originalSha256: string | null };

const MAX_EDGE = 1280;
const THUMB_EDGE = 160;
const QUALITY = 0.85;
const ORIGINAL_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ORIGINAL_MAX_BYTES = 5 * 1024 * 1024;

async function decode(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch (e) {
    // An engine that predates the "from-image" value rejects the option itself.
    if (e instanceof TypeError) return createImageBitmap(file);
    throw e;
  }
}

function toJpeg(bitmap: ImageBitmap, maxEdge: number, name: string): Promise<File | null> {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        canvas.width = 0;
        canvas.height = 0;
        resolve(blob ? new File([blob], name, { type: "image/jpeg" }) : null);
      },
      "image/jpeg",
      QUALITY,
    );
  });
}

/** The file's sha256 as lowercase hex, or null without Web Crypto (not a secure context) or on any failure. */
async function sha256Hex(file: File): Promise<string | null> {
  try {
    if (!globalThis.crypto?.subtle) return null;
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

function originalIfAccepted(file: File, originalSha256: string | null): ScanUpload | null {
  return ORIGINAL_TYPES.has(file.type) && file.size <= ORIGINAL_MAX_BYTES ? { photo: file, thumb: null, originalSha256 } : null;
}

async function reencode(file: File): Promise<{ photo: File; thumb: File | null } | "original"> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await decode(file);
  } catch {
    return "original";
  }
  try {
    const photo = await toJpeg(bitmap, MAX_EDGE, "photo.jpg");
    if (!photo) return "original";
    const thumb = await toJpeg(bitmap, THUMB_EDGE, "thumb.jpg");
    return { photo, thumb };
  } finally {
    bitmap.close();
  }
}

export async function prepareScanUpload(file: File): Promise<ScanUpload | null> {
  // The fingerprint of the file as picked, alongside the re-encode (both read the same file).
  const [originalSha256, prepared] = await Promise.all([sha256Hex(file), reencode(file)]);
  return prepared === "original" ? originalIfAccepted(file, originalSha256) : { ...prepared, originalSha256 };
}
