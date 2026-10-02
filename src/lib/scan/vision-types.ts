/**
 * Vision seam — photo of a plate → the dishes on it, with a portion estimate
 * per dish. Same adapter discipline as sms / payments / ofd / email: one
 * interface, a real RU provider (chosen by the 30-dish eval, Phase 2 slice 2),
 * a deterministic stub until then.
 *
 * Structure only: no free text, no verdicts, no health fields. The legacy
 * scanner's `health_insight` / `notes` are deliberately not ported — the
 * product never judges a plate (bible §6.3); the numbers are an estimate the
 * person reads for themselves.
 */
export type VisionContentType = "image/jpeg" | "image/png" | "image/webp";
export type VisionConfidence = "high" | "medium" | "low";
export type VisionDish = {
  /** Russian display name, e.g. «Плов с мясом». */
  name: string;
  /** Optional English search term for the later USDA tier; unused now. */
  searchTerm?: string;
  /** The model's portion estimate, integer grams. */
  grams: number;
  confidence: VisionConfidence;
  /** Where the dish sits in the frame, integer percent of width/height (the overlay's chip anchor). */
  bbox?: { x: number; y: number };
  /** The provider's own per-100 g estimate — the `ai` tier when the reference table has no row. */
  estimatePer100g?: { kcal: number; proteinMg: number; fatMg: number; carbsMg: number };
};
export type VisionResult = { isFood: boolean; confidence: VisionConfidence; dishes: VisionDish[] };
export type VisionInput = {
  image: Uint8Array;
  contentType: VisionContentType;
  hint?: string;
  /**
   * The sha256 (64 lowercase hex) of the file as the person picked it, before
   * the phone re-encoded it — the lens sends it as `originalSha256`. Only the
   * stub reads it (to pin its fixtures to the repo's seed photos); a real
   * recognizer looks at the pixels. Never stored, like the hint.
   */
  fingerprint?: string;
};
export type VisionProvider = {
  readonly name: string;
  recognize(input: VisionInput, opts?: { signal?: AbortSignal }): Promise<VisionResult>;
};
