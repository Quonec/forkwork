/**
 * Импорт заведений Москвы из OpenStreetMap (Overpass API) в seed/venues-moscow.json.
 * Данные © участники OpenStreetMap, лицензия ODbL (https://www.openstreetmap.org/copyright).
 * Запуск: node scripts/import-osm-venues.mjs
 * Берутся объекты с названием и amenity = restaurant | cafe | fast_food | bar | pub | food_court | biergarten.
 * Сайты, часы и телефоны есть только там, где их указали участники карты; ничего не дописывается.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "seed", "venues-moscow.json");
const ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://lz4.overpass-api.de/api/interpreter"];
const BBOX = { s: 55.14, w: 36.8, n: 56.03, e: 38.0 };
const GRID = 10;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const queryFor = (s, w, n, e) => `[out:json][timeout:120];
nwr["amenity"~"^(restaurant|cafe|fast_food|bar|pub|food_court|biergarten)$"]["name"](${s},${w},${n},${e});
out center tags;`;

/** Контур города Москвы (relation 102269) из Nominatim: проверяем, что заведение внутри города, а не в соседнем Мытищах или Химках. */
async function fetchBoundary() {
  const res = await fetch("https://nominatim.openstreetmap.org/lookup?osm_ids=R102269&polygon_geojson=1&polygon_threshold=0.0002&format=json", {
    headers: { "User-Agent": "forkwork-scanner/0.9 (venue import)" },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error("граница города: HTTP " + res.status);
  const geo = (await res.json())[0]?.geojson;
  if (!geo || !["Polygon", "MultiPolygon"].includes(geo.type)) throw new Error("граница города: нет полигона");
  return geo.type === "Polygon" ? [geo.coordinates] : geo.coordinates;
}

const inRing = (lng, lat, ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
/** polygons: массив полигонов, у каждого внешнее кольцо и дыры. */
const inCity = (lng, lat, polygons) => polygons.some((poly) => inRing(lng, lat, poly[0]) && !poly.slice(1).some((hole) => inRing(lng, lat, hole)));

const CACHE = path.join(path.dirname(OUT), ".tiles-cache.json");
const cache = (() => {
  try {
    return JSON.parse(readFileSync(CACHE, "utf8"));
  } catch {
    return {};
  }
})();
const saveCache = () => writeFileSync(CACHE, JSON.stringify(cache));

async function fetchTile(query) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    const url = ENDPOINTS[attempt % ENDPOINTS.length];
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "forkwork-scanner/0.9 (venue import)" },
        body: "data=" + encodeURIComponent(query),
        signal: AbortSignal.timeout(150_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()).elements ?? [];
    } catch (e) {
      lastError = e;
      await sleep(8000 * (attempt + 1));
    }
  }
  throw lastError;
}

/** Плитка, которую не удалось взять целиком, делится на четыре. */
async function loadBox(s, w, n, e, depth = 0) {
  const key = [s, w, n, e].map((x) => x.toFixed(4)).join(",");
  if (cache[key]) return cache[key];
  try {
    const els = await fetchTile(queryFor(key.split(",")[0], key.split(",")[1], key.split(",")[2], key.split(",")[3]));
    cache[key] = els;
    saveCache();
    await sleep(2500);
    return els;
  } catch (err) {
    if (depth >= 3) {
      console.warn(`  пропущен квадрат ${key}: ${err.message}`);
      return [];
    }
    console.log(`  делю квадрат ${key} (${err.message})`);
    const ms = (s + n) / 2, mw = (w + e) / 2;
    const out = [];
    for (const [a1, b1, c1, d1] of [[s, w, ms, mw], [s, mw, ms, e], [ms, w, n, mw], [ms, mw, n, e]]) out.push(...(await loadBox(a1, b1, c1, d1, depth + 1)));
    return out;
  }
}

async function fetchOverpass() {
  const elements = [];
  const dLat = (BBOX.n - BBOX.s) / GRID;
  const dLng = (BBOX.e - BBOX.w) / GRID;
  for (let i = 0; i < GRID; i++) {
    for (let j = 0; j < GRID; j++) {
      const s = BBOX.s + i * dLat, w = BBOX.w + j * dLng;
      const els = await loadBox(s, w, s + dLat, w + dLng);
      elements.push(...els);
      console.log(`квадрат ${i * GRID + j + 1}/${GRID * GRID}: +${els.length} (всего ${elements.length})`);
    }
  }
  return { elements };
}

const url = (s) => {
  if (!s) return "";
  let v = String(s).split(";")[0].trim();
  if (!v) return "";
  if (!/^https?:\/\//i.test(v)) v = "https://" + v.replace(/^\/\//, "");
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : "";
  } catch {
    return "";
  }
};

const city = await fetchBoundary();
console.log("контур города: полигонов", city.length);
const data = await fetchOverpass();
const rows = [];
const seen = new Set();
for (const el of data.elements ?? []) {
  const t = el.tags ?? {};
  const name = (t.name ?? "").trim();
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (!name || lat == null || lng == null) continue;
  if (!inCity(lng, lat, city)) continue;
  const id = `${el.type[0]}${el.id}`;
  if (seen.has(id)) continue;
  seen.add(id);
  const street = t["addr:street"] ?? "";
  const house = t["addr:housenumber"] ?? "";
  const address = [street, house].filter(Boolean).join(", ");
  rows.push([
    id,
    name,
    t.amenity,
    Math.round(lat * 1e5) / 1e5,
    Math.round(lng * 1e5) / 1e5,
    (t.cuisine ?? "").replace(/\s+/g, ""),
    address,
    url(t.website ?? t["contact:website"] ?? t.url),
    url(t["website:menu"] ?? t["menu:url"]),
    (t.phone ?? t["contact:phone"] ?? "").split(";")[0].trim(),
    t.opening_hours ?? "",
    t.brand ?? "",
  ]);
}

mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(
  OUT,
  JSON.stringify({ source: "OpenStreetMap (Overpass API)", license: "ODbL", fetchedAt: new Date().toISOString().slice(0, 10), fields: ["id", "name", "kind", "lat", "lng", "cuisine", "address", "website", "menuUrl", "phone", "hours", "brand"], rows }),
);
const c = (f) => rows.filter(f).length;
console.log(`Заведений: ${rows.length}; с адресом: ${c((r) => r[6])}; с сайтом: ${c((r) => r[7])}; со ссылкой на меню: ${c((r) => r[8])}; с часами: ${c((r) => r[10])}`);
