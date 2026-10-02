/**
 * The scan stream's wire vocabulary — what `POST /api/scans` sends as SSE
 * frames (`event: <name>` + `data: <json>`), shared by the server (run.ts)
 * and the lens client, which parses them with `createSseParser` (sse.ts) and
 * paces them with `createEventQueue` (choreography.ts).
 *
 * Keys, never Russian text: a `log` line is `{ key, params }` and the client
 * maps it to a phrase. No free text, no verdicts.
 */
export type ScanStatus = "analyzing" | "done" | "no_food" | "failed" | "cancelled";
export type ScanItemSource = "reference" | "ai";
export type ScanNutrition = { kcal: number; proteinMg: number; fatMg: number; carbsMg: number };

export type ScanItemView = {
  id: string;
  position: number;
  name: string;
  grams: number;
  estimatedGrams: number;
  edited: boolean;
  source: ScanItemSource;
  confidence: string;
  referenceName: string | null;
  bbox: { x: number; y: number } | null;
  per100g: ScanNutrition;
  perPortion: ScanNutrition;
};

export type ScanView = {
  id: string;
  status: ScanStatus;
  createdAt: string;
  completedAt: string | null;
  confidence: string | null;
  provider: string;
  photo: { available: boolean; expiresAt: string | null };
  items: ScanItemView[];
  total: { grams: number; kcal: number; proteinMg: number; fatMg: number; carbsMg: number };
};

export type ScanListRow = {
  id: string;
  createdAt: string;
  status: ScanStatus;
  thumb: { available: boolean };
  headline: string | null;
  moreCount: number;
  totalKcal: number;
};

export type ScanStage = 1 | 2 | 3;
export type ScanLogKey = "looking" | "see" | "weighing" | "summing" | "unlabelled" | "noFood";
export type ScanErrorEventCode = "NO_FOOD" | "NOTHING_LABELLED" | "SCAN_FAILED" | "SCAN_CANCELLED";

export type ScanEventMap = {
  started: { scanId: string; etaSeconds: number; stages: 3 };
  progress: { stage: ScanStage; progress: number };
  log: { key: ScanLogKey; params?: { name?: string } };
  item_found: { id: string; name: string; grams: number; bbox?: { x: number; y: number } };
  item_enriched: { id: string; source: ScanItemSource; kcal: number };
  stage_done: { stage: ScanStage };
  done: { scanId: string; view: ScanView };
  error: { code: ScanErrorEventCode; recoverable: boolean };
};

export type ScanEventName = keyof ScanEventMap;

export type ScanEvent = { [K in ScanEventName]: { event: K; data: ScanEventMap[K] } }[ScanEventName];

export const SCAN_EVENT_NAMES: readonly ScanEventName[] = [
  "started",
  "progress",
  "log",
  "item_found",
  "item_enriched",
  "stage_done",
  "done",
  "error",
];
