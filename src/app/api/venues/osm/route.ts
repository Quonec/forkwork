import { NextResponse } from "next/server";

import { getOsmVenue, nearbyOsmVenues, osmStats, searchOsmVenues } from "@/lib/venues/osm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const num = (s: string | null) => (s !== null && s.trim() !== "" && Number.isFinite(Number(s)) ? Number(s) : null);

/**
 * Заведения Москвы из OpenStreetMap (© участники OpenStreetMap, ODbL).
 *   ?bbox=юг,запад,север,восток  область карты

 *   ?cat=coffee|burger|pizza|sushi|italian|caucasian|shawarma|asian|russian|seafood|steak|bar  рубрика
 *   ?check=low|mid|high|top|known|unknown  средний чек (только где он известен из источников)
 *   ?q=название  ?kind=restaurant|cafe|fast_food|bar|pub|food_court|biergarten  ?site=1 только с сайтом
 *   ?segment=low|mid|high|top  ценовой сегмент (&exact=1 — только по чеку или данным источника, без оценки по виду)
 *   ?near=широта,долгота&exclude=<id>[&themes=coffee,pizza][&segment=low]  ближайшие заведения с расстоянием в метрах
 *   ?limit=1..500  ?offset=  ?id=<osm id> одно заведение  ?stats=1 счётчики
 */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  if (p.get("stats")) return NextResponse.json(osmStats());
  const near = p.get("near");
  if (near) {
    const [la, ln] = near.split(",").map((x) => num(x));
    if (la === null || ln === null || la === undefined || ln === undefined) return NextResponse.json({ error: "near: широта,долгота" }, { status: 400 });
    const n = Math.min(30, Math.max(1, num(p.get("limit")) ?? 10));
    const themes = (p.get("themes") ?? "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 6);
    const segment = p.get("segment") ?? undefined;
    return NextResponse.json({ venues: nearbyOsmVenues(la, ln, n, p.get("exclude") ?? undefined, { themes, segment }) });
  }
  const id = p.get("id");
  if (id) {
    const v = getOsmVenue(id);
    return v ? NextResponse.json({ venue: v }) : NextResponse.json({ error: "Не найдено" }, { status: 404 });
  }
  let bbox: [number, number, number, number] | undefined;
  const raw = p.get("bbox");
  if (raw) {
    const parts = raw.split(",").map((x) => num(x));
    if (parts.length !== 4 || parts.some((x) => x === null)) return NextResponse.json({ error: "bbox: юг,запад,север,восток" }, { status: 400 });
    bbox = parts as [number, number, number, number];
  }
  const limit = Math.min(500, Math.max(1, num(p.get("limit")) ?? 50));
  const offset = Math.max(0, num(p.get("offset")) ?? 0);
  const q = (p.get("q") ?? "").trim().slice(0, 80);
  const res = searchOsmVenues({ bbox, q: q || undefined, kind: p.get("kind") ?? undefined, withWebsite: p.get("site") === "1", cat: p.get("cat") ?? undefined, segment: p.get("segment") ?? undefined, exact: p.get("exact") === "1", check: p.get("check") ?? undefined, limit, offset });
  return NextResponse.json({ ...res, limit, offset });
}
