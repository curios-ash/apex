import { NextResponse } from "next/server";

import { openDealFromSearchForm } from "@/lib/deals/open-from-search";

export const dynamic = "force-dynamic";

function redirectTo(request: Request, path: string) {
  return NextResponse.redirect(new URL(path, request.url), 303);
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const result = await openDealFromSearchForm(formData);
  if (!result.ok) {
    return redirectTo(request, `/deals?error=${result.error}`);
  }
  return redirectTo(request, `/deals/${result.propertyId}`);
}
