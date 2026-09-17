import { NextResponse } from "next/server";
// workspace alias + optional +deal tag routes captures onto a property.

import { parseInboundAlias } from "@/deals/inbound-alias";
import { db } from "@/lib/db";
import { properties } from "@/lib/db/schema";
import { normalizeInboundEmail } from "@/lib/inbound-email";
import { ingestDocumentBytes } from "@/lib/ingest/ingest";
import { getWorkspaceBySlug } from "@/lib/workspace";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

// Inbound email webhook (Resend/Postmark-style payloads). Resolves the
// workspace from the alias (<slug>@in.<domain>), stores each attachment as a
// document, and runs the classify + extract pipeline on each.
export async function POST(request: Request) {
  const secret = process.env.INBOUND_EMAIL_SECRET;
  if (secret) {
    const url = new URL(request.url);
    const provided = request.headers.get("x-inbound-secret") ?? url.searchParams.get("secret");
    if (provided !== secret) {
      return NextResponse.json({ ok: false, message: "Unauthorized." }, { status: 401 });
    }
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Expected a JSON body." }, { status: 400 });
  }

  const email = normalizeInboundEmail(body);
  if (!email) {
    return NextResponse.json(
      { ok: false, message: "Unrecognized inbound email payload." },
      { status: 400 },
    );
  }

  const alias = parseInboundAlias(email.to);
  if (!alias) {
    // 200 so the provider does not retry a message we can never route.
    return NextResponse.json({ ok: false, reason: "no_alias_recipient" });
  }

  const workspace = await getWorkspaceBySlug(alias.slug);
  if (!workspace) {
    return NextResponse.json({ ok: false, reason: "unknown_workspace", slug: alias.slug });
  }

  let propertyId: string | null = null;
  if (alias.tag) {
    const [deal] = await db
      .select({ id: properties.id })
      .from(properties)
      .where(and(eq(properties.workspaceId, workspace.id), eq(properties.inboundTag, alias.tag)))
      .limit(1);
    propertyId = deal?.id ?? null;
  }

  const results: {
    documentId: string;
    filename: string;
    duplicate: boolean;
    status: string;
    documentType: string;
  }[] = [];
  const failures: { filename: string; error: string }[] = [];

  for (const attachment of email.attachments) {
    try {
      const bytes = new Uint8Array(Buffer.from(attachment.contentBase64, "base64"));
      const result = await ingestDocumentBytes({
        workspaceId: workspace.id,
        filename: attachment.filename,
        bytes,
        mimeType: attachment.contentType,
        source: "email",
        propertyId,
        emailSubject: email.subject,
      });
      results.push(result);
    } catch (error) {
      console.error(`inbound attachment ${attachment.filename} failed`, error);
      failures.push({ filename: attachment.filename, error: String(error) });
    }
  }

  // No attachments: keep the body text itself as the document (covers owners
  // who paste a statement or listing into the forward).
  if (email.attachments.length === 0 && email.text && email.text.trim().length > 0) {
    try {
      const filename = `${email.subject.trim().replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 80) || "email"}.txt`;
      const result = await ingestDocumentBytes({
        workspaceId: workspace.id,
        filename,
        bytes: new Uint8Array(Buffer.from(email.text, "utf8")),
        mimeType: "text/plain",
        source: "email",
        propertyId,
        emailSubject: email.subject,
      });
      results.push(result);
    } catch (error) {
      console.error("inbound body ingest failed", error);
      failures.push({ filename: "body.txt", error: String(error) });
    }
  }

  return NextResponse.json({
    ok: failures.length === 0,
    workspaceSlug: workspace.slug,
    propertyId,
    provider: email.provider,
    documents: results,
    failures,
  });
}
