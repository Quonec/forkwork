import type { VenueReview } from "./reviews";

export type ReviewStats = { total: number; plus: number; mixed: number; minus: number; sources: number };

export function reviewStats(list: VenueReview[]): ReviewStats {
  return {
    total: list.length,
    plus: list.filter((x) => x.tone === "+").length,
    mixed: list.filter((x) => x.tone === "±").length,
    minus: list.filter((x) => x.tone === "-").length,
    sources: new Set(list.map((x) => x.source)).size,
  };
}
