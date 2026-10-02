/**
 * Заведения Москвы из OpenStreetMap (© участники OpenStreetMap, ODbL).
 * Снимок лежит в seed/venues-moscow.json (обновляется scripts/import-osm-venues.mjs)
 * и при первом обращении загружается в SQLite. Сайты, часы и телефоны есть
 * только там, где их указали участники карты; ничего не дописываем.
 */
import fs from "node:fs";
import path from "node:path";

import { db } from "@/lib/db";

import { CHAIN_CHECKS, chainOf } from "./chains";
import { cuisineFacts } from "./cuisine";
import { OSM_CATEGORIES } from "./categories";
import { CHECK_BRACKETS, SEGMENT_OVERRIDES } from "./top25-extra";
import { estimateSegment, segmentLabel, segmentOfCheck, SEGMENT_BASIS_LABEL, themeLabel, themesFrom, type SegmentBasis, type ThemeBasis } from "./themes";
import { MORE_VENUES } from "./more";
import { TOP_VENUES } from "./top25";
import { distanceMeters, formatMetro, hasMetroData, nearestMetro, type Metro } from "./metro";

export type OsmVenue = {
  id: string;
  name: string;
  kind: string;
  kindLabel: string;
  lat: number;
  lng: number;
  cuisine: string[];
  address: string;
  website: string;
  menuUrl: string;
  phone: string;
  hours: string;
  brand: string;
  /** Ближайшая станция метро в пределах 3 км (по прямой). */
  metro: Metro | null;
  /** Сколько других заведений в базе с таким же названием. */
  sameName: number;
  /** Тематика: по тегу кухни OpenStreetMap, по названию или по виду заведения (см. themeBasis). */
  themes: { id: string; label: string }[];
  themeBasis: ThemeBasis;
  /** Ценовой сегмент: по среднему чеку из источника или оценка по виду заведения (см. basis). */
  segment: { id: string; label: string; basis: SegmentBasis; note: string } | null;
  /** Средний чек на человека из страниц источников (у сетей из набора и избранных заведений). */
  avgCheck: { rub: number; text: string; url: string } | null;
  /** Не меньше двух проверяемых фактов: вычислены из данных OpenStreetMap и координат. */
  facts: string[];
  /** Два факта о кухне: общие сведения о типе кухни или заведения, КБЖУ из справочника сканера. */
  cuisineFacts: string[];
};

const KIND_LABEL: Record<string, string> = {
  restaurant: "Ресторан",
  cafe: "Кафе",
  fast_food: "Фастфуд",
  bar: "Бар",
  pub: "Паб",
  food_court: "Фудкорт",
  biergarten: "Пивной сад",
};

const CUISINE_LABEL: Record<string, string> = {
  russian: "русская", georgian: "грузинская", italian: "итальянская", japanese: "японская", sushi: "суши", pizza: "пицца",
  burger: "бургеры", coffee_shop: "кофе", uzbek: "узбекская", chinese: "китайская", asian: "азиатская", european: "европейская",
  french: "французская", american: "американская", steak_house: "стейк-хаус", vegetarian: "вегетарианская", vegan: "веганская",
  seafood: "морепродукты", kebab: "кебаб", regional: "региональная", armenian: "армянская", korean: "корейская", thai: "тайская",
  indian: "индийская", mexican: "мексиканская", german: "немецкая", turkish: "турецкая", ukrainian: "украинская", azerbaijani: "азербайджанская",
  chicken: "курица", sandwich: "сэндвичи", ice_cream: "мороженое", bakery: "выпечка", pancake: "блины", dumpling: "пельмени и вареники",
  noodle: "лапша", ramen: "рамен", grill: "гриль", barbecue: "барбекю", mediterranean: "средиземноморская", fish: "рыба", breakfast: "завтраки",
};

export const KINDS = Object.keys(KIND_LABEL);
const SEGMENT_IDS = ['low', 'mid', 'high', 'top'];
export const fold = (s: string): string => s.toLowerCase().replace(/ё/g, "е");

const SEED = path.join(process.cwd(), "seed", "venues-moscow.json");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS osm_venues (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_fold TEXT NOT NULL,
  kind TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  cuisine TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  menu_url TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  hours TEXT NOT NULL DEFAULT '',
  brand TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS osm_venues_pos_idx ON osm_venues (lat, lng);
CREATE INDEX IF NOT EXISTS osm_venues_name_idx ON osm_venues (name_fold);
`;

let loaded = false;

function migrate(): void {
  const cols = (db.prepare("PRAGMA table_info(osm_venues)").all() as unknown as { name: string }[]).map((c) => c.name);
  if (!cols.includes("metro")) db.exec("ALTER TABLE osm_venues ADD COLUMN metro TEXT");
  if (!cols.includes("metro_m")) db.exec("ALTER TABLE osm_venues ADD COLUMN metro_m INTEGER");
  if (!cols.includes("same_name")) db.exec("ALTER TABLE osm_venues ADD COLUMN same_name INTEGER");
  if (!cols.includes("avg_check")) db.exec("ALTER TABLE osm_venues ADD COLUMN avg_check INTEGER");
  if (!cols.includes("check_text")) db.exec("ALTER TABLE osm_venues ADD COLUMN check_text TEXT");
  if (!cols.includes("check_url")) db.exec("ALTER TABLE osm_venues ADD COLUMN check_url TEXT");
  if (!cols.includes("themes")) db.exec("ALTER TABLE osm_venues ADD COLUMN themes TEXT");
  if (!cols.includes("theme_basis")) db.exec("ALTER TABLE osm_venues ADD COLUMN theme_basis TEXT");
  if (!cols.includes("segment")) db.exec("ALTER TABLE osm_venues ADD COLUMN segment TEXT");
  if (!cols.includes("segment_basis")) db.exec("ALTER TABLE osm_venues ADD COLUMN segment_basis TEXT");
}

let checksApplied = false;

const plain = (s: string): string => fold(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Средний чек из страниц источников: у сетей из набора и у избранных заведений. У остальных его нет, и мы его не выдумываем. */
function applyChecks(): void {
  if (checksApplied) return;
  checksApplied = true;
  const set = db.prepare("UPDATE osm_venues SET avg_check = ?, check_text = ?, check_url = ? WHERE id = ? AND avg_check IS NULL");
  const rows = db.prepare("SELECT id, name FROM osm_venues WHERE avg_check IS NULL").all() as unknown as { id: string; name: string }[];
  db.exec("BEGIN");
  try {
    for (const r of rows) {
      const chain = chainOf(r.name);
      const c = chain ? CHAIN_CHECKS[chain.id] : undefined;
      if (c) set.run(c.rub, c.text, c.url, r.id);
    }
    const near = db.prepare("SELECT id, name FROM osm_venues WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?");
    for (const v of [...TOP_VENUES, ...MORE_VENUES]) {
      if (!v.avgCheck) continue;
      const key = plain(v.name);
      for (const r of near.all(v.lat - 0.004, v.lat + 0.004, v.lng - 0.007, v.lng + 0.007) as unknown as { id: string; name: string }[]) {
        const n = plain(r.name);
        if (n === key || n.includes(key) || key.includes(n)) set.run(v.avgCheck.rub, v.avgCheck.text, v.avgCheck.url, r.id);
      }
    }
    db.exec("COMMIT");
  } catch (e) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    throw e;
  }
}

let themesApplied = false;

/** Один раз определяет тематику и ценовой сегмент каждого заведения (см. themes.ts) и пишет их в базу. */
function applyThemes(): void {
  if (themesApplied) return;
  themesApplied = true;
  const rows = db.prepare("SELECT id, name, kind, cuisine, lat, lng, avg_check FROM osm_venues WHERE themes IS NULL OR theme_basis IN ('none', 'name', 'kind')").all() as unknown as {
    id: string;
    name: string;
    kind: string;
    cuisine: string;
    lat: number;
    lng: number;
    avg_check: number | null;
  }[];
  if (rows.length === 0) return;
  const upd = db.prepare("UPDATE osm_venues SET themes = ?, theme_basis = ?, segment = ?, segment_basis = ? WHERE id = ?");
  db.exec("BEGIN");
  try {
    for (const r of rows) {
      const tags = r.cuisine.split(";").filter(Boolean);
      const th = themesFrom(tags, r.kind, r.name);
      let segment = "";
      let basis: SegmentBasis = "type";
      const over = SEGMENT_OVERRIDES.find((o) => Math.abs(o.lat - r.lat) < 0.004 && Math.abs(o.lng - r.lng) < 0.007 && plain(r.name).includes(plain(o.name)));
      if (r.avg_check != null) {
        segment = segmentOfCheck(r.avg_check);
        basis = "check";
      } else if (over) {
        segment = over.segment;
        basis = "source";
      } else {
        segment = estimateSegment(r.kind, tags, th.ids);
      }
      upd.run(th.ids.join(";"), th.basis, segment, basis, r.id);
    }
    db.exec("COMMIT");
  } catch (e) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    throw e;
  }
}

let enriched = false;

/** Один раз считает ближайшее метро и число одноимённых заведений для строк, где этого ещё нет. */
function enrich(): void {
  applyChecks();
  applyThemes();
  if (enriched) return;
  enriched = true;
  const todo = db.prepare("SELECT id, lat, lng FROM osm_venues WHERE metro_m IS NULL").all() as unknown as { id: string; lat: number; lng: number }[];
  if (todo.length > 0 && hasMetroData()) {
    const upd = db.prepare("UPDATE osm_venues SET metro = ?, metro_m = ? WHERE id = ?");
    db.exec("BEGIN");
    try {
      for (const r of todo) {
        const m = nearestMetro(r.lat, r.lng);
        upd.run(m ? m.name : "", m ? m.meters : -1, r.id);
      }
      db.exec("COMMIT");
    } catch (e) {
      try {
        db.exec("ROLLBACK");
      } catch {}
      throw e;
    }
  }
  db.exec(
    "UPDATE osm_venues SET same_name = (SELECT COUNT(*) - 1 FROM osm_venues o WHERE o.name_fold = osm_venues.name_fold) WHERE same_name IS NULL",
  );
}

/** Создаёт таблицу и, если она пуста, заполняет из снимка. Возвращает число заведений. */
export function ensureOsmVenues(): number {
  if (!loaded) {
    db.exec(SCHEMA);
    migrate();
  }
  const count = (db.prepare("SELECT COUNT(*) AS n FROM osm_venues").get() as { n: number }).n;
  if (count > 0 || !fs.existsSync(SEED)) {
    loaded = true;
    if (count > 0) enrich();
    return count;
  }
  const snapshot = JSON.parse(fs.readFileSync(SEED, "utf8")) as { rows: (string | number)[][] };
  const ins = db.prepare(
    "INSERT OR IGNORE INTO osm_venues (id, name, name_fold, kind, lat, lng, cuisine, address, website, menu_url, phone, hours, brand) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
  );
  db.exec("BEGIN");
  try {
    for (const r of snapshot.rows) {
      ins.run(r[0], r[1], fold(String(r[1])), r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9], r[10], r[11]);
    }
    db.exec("COMMIT");
  } catch (e) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    throw e;
  }
  loaded = true;
  enrich();
  return snapshot.rows.length;
}

type Row = {
  id: string; name: string; kind: string; lat: number; lng: number; cuisine: string;
  address: string; website: string; menu_url: string; phone: string; hours: string; brand: string;
  metro: string | null; metro_m: number | null; same_name: number | null;
  avg_check: number | null; check_text: string | null; check_url: string | null;
  themes: string | null; theme_basis: string | null; segment: string | null; segment_basis: string | null;
};

const DAYS: Record<string, string> = { Mo: "пн", Tu: "вт", We: "ср", Th: "чт", Fr: "пт", Sa: "сб", Su: "вс", PH: "праздники" };

/** Часы из формата OpenStreetMap на русский для типичных случаев; незнакомое оставляет как есть. */
export function formatHours(h: string): string {
  if (!h) return "";
  if (h.trim() === "24/7") return "круглосуточно";
  return h
    .replace(/\bMo-Su\b/g, "ежедневно")
    .replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH)\b/g, (d) => DAYS[d] ?? d)
    .replace(/(\d{2}:\d{2})-(\d{2}:\d{2})/g, "$1–$2")
    .replace(/\boff\b/g, "выходной")
    .replace(/;\s*/g, "; ");
}

function plural(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "заведение";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "заведения";
  return "заведений";
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Факты о заведении из данных OpenStreetMap и координат; всегда не меньше двух. */
function buildFacts(v: Omit<OsmVenue, "facts" | "cuisineFacts">): string[] {
  const facts: string[] = [];
  facts.push(`${v.kindLabel}${v.cuisine.length ? `, кухня: ${v.cuisine.join(", ")}` : ""}`);
  if (v.avgCheck) facts.push(`Средний чек: ${v.avgCheck.text}`);
  if (v.metro) facts.push(formatMetro(v.metro));
  if (v.sameName >= 3) facts.push(`Похоже на сеть: в Москве ещё ${v.sameName} ${plural(v.sameName)} с таким названием`);
  if (v.address) facts.push(`Адрес: ${v.address}`);
  if (v.hours) facts.push(`Часы работы: ${v.hours}`);
  if (v.phone) facts.push(`Телефон: ${v.phone}`);
  if (v.website) facts.push(`Сайт: ${hostOf(v.website)}`);
  if (facts.length < 2) facts.push(`Координаты на карте: ${v.lat.toFixed(4)}, ${v.lng.toFixed(4)}`);
  return facts.slice(0, 6);
}

const toVenue = (r: Row): OsmVenue => {
  const base = {
    id: r.id,
    name: r.name,
    kind: r.kind,
    kindLabel: KIND_LABEL[r.kind] ?? "Заведение",
    lat: r.lat,
    lng: r.lng,
    cuisine: r.cuisine.split(";").map((c) => CUISINE_LABEL[c]).filter((c): c is string => Boolean(c)),
    address: r.address,
    website: r.website,
    menuUrl: r.menu_url,
    phone: r.phone,
    hours: formatHours(r.hours),
    brand: r.brand,
    metro: r.metro && r.metro_m != null && r.metro_m >= 0 ? { name: r.metro, meters: r.metro_m } : null,
    sameName: r.same_name ?? 0,
    themes: (r.themes ?? "").split(";").filter(Boolean).map((id) => ({ id, label: themeLabel(id) })),
    themeBasis: (r.theme_basis ?? "none") as ThemeBasis,
    segment: r.segment
      ? { id: r.segment, label: segmentLabel(r.segment), basis: (r.segment_basis ?? "type") as SegmentBasis, note: SEGMENT_BASIS_LABEL[(r.segment_basis ?? "type") as SegmentBasis] }
      : null,
    avgCheck: r.avg_check != null && r.check_text ? { rub: r.avg_check, text: r.check_text, url: r.check_url ?? "" } : null,
  };
  return { ...base, facts: buildFacts(base), cuisineFacts: cuisineFacts(r.cuisine.split(";").filter(Boolean), r.kind) };
};


export type OsmQuery = {
  bbox?: [number, number, number, number]; // south, west, north, east
  q?: string;
  kind?: string;
  withWebsite?: boolean;
  /** Рубрика из OSM_CATEGORIES. */
  /** Тематика: id из OSM_CATEGORIES. */
  cat?: string;
  /** Ценовой сегмент: low | mid | high | top | unknown. */
  segment?: string;
  /** Только сегменты, посчитанные по настоящему среднему чеку или данным источника, без оценки по виду. */
  exact?: boolean;
  /** low | mid | high | top — рубль-границы из CHECK_BRACKETS; known — чек известен; unknown — не известен. */
  check?: string;
  limit: number;
  offset: number;
};

export function searchOsmVenues(query: OsmQuery): { total: number; venues: OsmVenue[] } {
  ensureOsmVenues();
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (query.bbox) {
    where.push("lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?");
    args.push(query.bbox[0], query.bbox[2], query.bbox[1], query.bbox[3]);
  }
  if (query.q) {
    where.push("name_fold LIKE ? ESCAPE '\\'");
    args.push(`%${fold(query.q).replace(/[\\%_]/g, (m) => "\\" + m)}%`);
  }
  if (query.kind && KINDS.includes(query.kind)) {
    where.push("kind = ?");
    args.push(query.kind);
  }
  if (query.withWebsite) where.push("(website != '' OR menu_url != '')");
  const cat = OSM_CATEGORIES.find((c) => c.id === query.cat);
  if (cat) {
    where.push("(';' || themes || ';') LIKE ?");
    args.push(`%;${cat.id};%`);
  }
  if (query.segment && SEGMENT_IDS.includes(query.segment)) {
    where.push("segment = ?");
    args.push(query.segment);
  } else if (query.segment === "unknown") where.push("segment IS NULL");
  if (query.exact) where.push("segment_basis IN ('check','source')");
  const br = CHECK_BRACKETS.find((b) => b.id === query.check);
  if (br) {
    where.push("avg_check BETWEEN ? AND ?");
    args.push(br.min, br.max);
  } else if (query.check === "known") where.push("avg_check IS NOT NULL");
  else if (query.check === "unknown") where.push("avg_check IS NULL");
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM osm_venues ${clause}`).get(...args) as { n: number }).n;
  // Одинаковые названия сетей не идут подряд: сначала по одной точке каждого названия, потом вторые и так далее.
  // Внутри круга сначала те, у кого есть сайт (к ним можно перейти за меню). id в конце делает порядок стабильным между страницами.
  const rows = db
    .prepare(
      `SELECT * FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY name_fold ORDER BY (website != '' OR menu_url != '') DESC, id) AS rn FROM osm_venues ${clause})
       ORDER BY rn, (website != '' OR menu_url != '') DESC, (name_fold GLOB '[а-яa-z0-9]*') DESC, name_fold, id LIMIT ? OFFSET ?`,
    )
    .all(...args, query.limit, query.offset) as unknown as Row[];
  return { total, venues: rows.map(toVenue) };
}

/** Ближайшие к точке заведения из базы: с расстоянием по прямой в метрах. */
export function nearbyOsmVenues(
  lat: number,
  lng: number,
  limit: number,
  excludeId?: string,
  by?: { themes?: string[]; segment?: string },
): (OsmVenue & { meters: number })[] {
  ensureOsmVenues();
  const extra: string[] = [];
  const extraArgs: (string | number)[] = [];
  if (by?.themes?.length) {
    extra.push(`(${by.themes.map(() => "(';' || themes || ';') LIKE ?").join(" OR ")})`);
    extraArgs.push(...by.themes.map((t) => `%;${t};%`));
  }
  if (by?.segment && SEGMENT_IDS.includes(by.segment)) {
    extra.push("segment = ?");
    extraArgs.push(by.segment);
  }
  const q = db.prepare(`SELECT * FROM osm_venues WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ? AND id != ? ${extra.map((e) => `AND ${e}`).join(" ")}`);
  let rows: Row[] = [];
  for (const d of [0.003, 0.006, 0.012, 0.025, 0.05]) {
    rows = q.all(lat - d, lat + d, lng - d * 1.8, lng + d * 1.8, excludeId ?? "", ...extraArgs) as unknown as Row[];
    if (rows.length >= limit * 3) break;
  }
  return rows
    .map((r) => ({ r, meters: Math.round(distanceMeters(lat, lng, r.lat, r.lng)) }))
    .sort((a, b) => a.meters - b.meters)
    .slice(0, limit)
    .map(({ r, meters }) => ({ ...toVenue(r), meters }));
}

export function getOsmVenue(id: string): OsmVenue | null {
  ensureOsmVenues();
  const row = db.prepare("SELECT * FROM osm_venues WHERE id = ?").get(id) as Row | undefined;
  return row ? toVenue(row) : null;
}

export function osmStats(): { total: number; withWebsite: number; withMenuUrl: number } {
  const total = ensureOsmVenues();
  const w = db.prepare("SELECT SUM(website != '') AS a, SUM(menu_url != '') AS b FROM osm_venues").get() as { a: number | null; b: number | null };
  return { total, withWebsite: w.a ?? 0, withMenuUrl: w.b ?? 0 };
}
