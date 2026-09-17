import { NextResponse } from "next/server";

import { lookupPlaces } from "@/deals/geocode";
import { getActiveWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await getActiveWorkspace();
  } catch {
    return NextResponse.json({ ok: false, message: "No workspace." }, { status: 401 });
  }

  const q = new URL(request.url).searchParams.get("q") ?? "";
  try {
    const result = await lookupPlaces(q);
    return NextResponse.json({
      ok: true,
      provider: result.provider,
      suggestions: result.suggestions.map((s) => ({
        placeId: s.placeId,
        label: s.label,
        geocoder: s.geocoder,
        matched: s.matched,
        query: q,
      })),
    });
  } catch (error) {
    console.error("places suggest failed", error);
    return NextResponse.json({ ok: false, message: "Lookup failed." }, { status: 500 });
  }
}
