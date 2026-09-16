import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { waitlist } from "@/lib/db/schema";
import { isValidEmail, normalizeEmail } from "@/lib/waitlist";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "Send a JSON body with your email address." },
      { status: 400 },
    );
  }

  const email = normalizeEmail((body as { email?: unknown })?.email);
  if (!isValidEmail(email)) {
    return NextResponse.json(
      { ok: false, message: "That doesn't look like a valid email address." },
      { status: 400 },
    );
  }

  try {
    const inserted = await db
      .insert(waitlist)
      .values({ email, source: "landing" })
      .onConflictDoNothing({ target: waitlist.email })
      .returning({ id: waitlist.id });

    if (inserted.length === 0) {
      return NextResponse.json({ ok: true, alreadyJoined: true });
    }
    return NextResponse.json({ ok: true, alreadyJoined: false }, { status: 201 });
  } catch (error) {
    console.error("waitlist insert failed", error);
    return NextResponse.json(
      { ok: false, message: "Something went wrong on our end. Please try again in a moment." },
      { status: 500 },
    );
  }
}
