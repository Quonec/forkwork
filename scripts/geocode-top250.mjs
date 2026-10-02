// Ставит координаты заведениям из seed/top250/batch-*.json по адресу (Nominatim, ≤1 запрос в секунду).
// Уже найденные не трогает. Запуск: node scripts/geocode-top250.mjs
import fs from "node:fs";
import path from "node:path";

const DIR = path.join(process.cwd(), "seed", "top250");
const COORDS = path.join(DIR, "coords.json");
const coords = fs.existsSync(COORDS) ? JSON.parse(fs.readFileSync(COORDS, "utf8")) : {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const clean = (a) => a.replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim();
async function geocode(q) {
  const u = "https://nominatim.openstreetmap.org/search?format=json&limit=1&viewbox=36.8,56.0,38.2,55.1&bounded=1&q=" + encodeURIComponent(q + ", Москва");
  const r = await (await fetch(u, { headers: { "User-Agent": "forkwork-scanner/0.9 (hron099@gmail.com)" } })).json();
  await sleep(1100);
  return r[0] ? [Number(Number(r[0].lat).toFixed(5)), Number(Number(r[0].lon).toFixed(5))] : null;
}

let added = 0;
const missing = [];
for (const f of fs.readdirSync(DIR).filter((x) => /^batch-.*\.json$/.test(x)).sort()) {
  for (const e of JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"))) {
    if (coords[e.id]) continue;
    const a = clean(e.address);
    let c = await geocode(a);
    if (!c) c = await geocode(a.replace(/(\d+)\s*(?:с|к|стр\.?)\s*\d+.*$/i, "$1"));
    if (c) {
      coords[e.id] = c;
      added++;
    } else missing.push(`${e.id}: ${a}`);
  }
}
fs.writeFileSync(COORDS, JSON.stringify(coords, null, 1));
console.log(`добавлено ${added}, без координат ${missing.length}`);
for (const m of missing) console.log("  нет:", m);
