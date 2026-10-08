/**
 * Ближайшая станция метро или МЦК по координатам. Станции из OpenStreetMap
 * (seed/metro-moscow.json, © участники OpenStreetMap, ODbL); расстояние по
 * прямой, а не пешком.
 */
import fs from "node:fs";
import path from "node:path";

export type Metro = { name: string; meters: number };

const SEED = path.join(process.cwd(), "seed", "metro-moscow.json");
const MAX_METERS = 3000;

let stations: [string, number, number][] | null = null;

function load(): [string, number, number][] {
  if (stations) return stations;
  try {
    stations = (JSON.parse(fs.readFileSync(SEED, "utf8")) as { rows: [string, number, number][] }).rows;
  } catch {
    stations = [];
  }
  return stations;
}

export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function hasMetroData(): boolean {
  return load().length > 0;
}

/** Ближайшая станция в пределах 3 км или null. */
export function nearestMetro(lat: number, lng: number): Metro | null {
  let best: Metro | null = null;
  for (const [name, sLat, sLng] of load()) {
    // грубая отсечка: 1° широты ≈ 111 км
    if (Math.abs(sLat - lat) > 0.04 || Math.abs(sLng - lng) > 0.07) continue;
    const m = distanceMeters(lat, lng, sLat, sLng);
    if (m <= MAX_METERS && (!best || m < best.meters)) best = { name, meters: Math.round(m) };
  }
  return best;
}

export function formatMetro(m: Metro): string {
  const dist = m.meters >= 1000 ? `${(m.meters / 1000).toFixed(1).replace(".", ",")} км` : `около ${Math.round(m.meters / 10) * 10} м`;
  return `Ближайшее метро: ${m.name}, ${dist} по прямой`;
}
