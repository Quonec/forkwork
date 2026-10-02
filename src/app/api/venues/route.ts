import { NextResponse } from "next/server";

import { venueProvider } from "@/lib/venues/data";
import { venueDto } from "@/lib/venues/ratings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Реальные заведения Москвы: факты, спектр звёзд с источников, описание меню и мнения критиков. */
export async function GET() {
  const brands = venueProvider.listBrands();
  return NextResponse.json({
    source: venueProvider.name,
    verifiedAt: venueProvider.verifiedAt,
    venues: venueProvider.listVenues().map((v) => venueDto(v, brands.find((b) => b.id === v.brandId))),
    brands,
  });
}
