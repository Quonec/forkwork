/**
 * Станции метро и МЦК Москвы из OpenStreetMap (Overpass API) в seed/metro-moscow.json.
 * Данные © участники OpenStreetMap, лицензия ODbL. Запуск: node scripts/import-osm-metro.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "seed", "metro-moscow.json");
const QUERY = `[out:json][timeout:120];
(
  node["railway"="station"]["station"="subway"](55.45,37.2,56.0,37.95);
  node["railway"="station"]["network"~"МЦК|Московское центральное кольцо"](55.45,37.2,56.0,37.95);
  node["railway"="station"]["station"="light_rail"]["network"~"МЦК|Московское центральное кольцо"](55.45,37.2,56.0,37.95);
);
out body;`;

let json;
for (let attempt = 0; attempt < 5 && !json; attempt++) {
  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "forkwork-scanner/0.9 (metro import)" },
      body: "data=" + encodeURIComponent(QUERY),
      signal: AbortSignal.timeout(150_000),
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    json = await res.json();
  } catch (e) {
    console.warn("попытка", attempt + 1, e.message);
    await new Promise((r) => setTimeout(r, 8000 * (attempt + 1)));
  }
}
if (!json) throw new Error("Overpass не ответил");

const seen = new Map();
for (const el of json.elements) {
  const name = (el.tags?.name ?? "").trim();
  if (!name || el.lat == null) continue;
  // у станции несколько узлов (пересадки, разные линии): оставляем по названию первый
  if (!seen.has(name)) seen.set(name, [name, Math.round(el.lat * 1e5) / 1e5, Math.round(el.lon * 1e5) / 1e5]);
}
mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ source: "OpenStreetMap (Overpass API)", license: "ODbL", fetchedAt: new Date().toISOString().slice(0, 10), fields: ["name", "lat", "lng"], rows: [...seen.values()] }));
console.log("Станций метро и МЦК:", seen.size);
