import { parseInboundAlias } from "@/deals/inbound-alias";

// Normalizes Resend- and Postmark-style inbound email webhook payloads into
// one shape. Pure functions — unit-tested without a server.
//
// Postmark posts the full message (attachments as base64 in Attachments[]).
// Resend's email.received webhook carries metadata only, so for Resend the
// payload must be the full retrieved email (attachments with inline base64
// content) — see README "Inbound email".

export interface InboundAttachment {
  filename: string;
  contentType: string | null;
  contentBase64: string;
}

export interface NormalizedInboundEmail {
  provider: "postmark" | "resend";
  from: string;
  to: string[];
  subject: string;
  text: string | null;
  messageId: string | null;
  attachments: InboundAttachment[];
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asAddressList(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === "string" ? v : null))
      .filter((v): v is string => v !== null);
  }
  return [];
}

function normalizePostmark(body: Record<string, unknown>): NormalizedInboundEmail | null {
  const from = asString(body.From);
  const toRaw = asAddressList(body.To);
  const toFull = Array.isArray(body.ToFull) ? body.ToFull : [];
  const to = [
    ...toRaw,
    ...toFull
      .map((t) => (t && typeof t === "object" ? asString((t as Record<string, unknown>).Email) : null))
      .filter((v): v is string => v !== null),
  ];
  if (!from || to.length === 0) return null;

  const attachments: InboundAttachment[] = [];
  if (Array.isArray(body.Attachments)) {
    for (const a of body.Attachments) {
      if (!a || typeof a !== "object") continue;
      const rec = a as Record<string, unknown>;
      const name = asString(rec.Name);
      const content = asString(rec.Content);
      if (!name || !content) continue;
      attachments.push({
        filename: name,
        contentType: asString(rec.ContentType),
        contentBase64: content,
      });
    }
  }

  return {
    provider: "postmark",
    from,
    to,
    subject: asString(body.Subject) ?? "",
    text: asString(body.TextBody),
    messageId: asString(body.MessageID),
    attachments,
  };
}

function normalizeResend(body: Record<string, unknown>): NormalizedInboundEmail | null {
  const data = body.data;
  if (!data || typeof data !== "object") return null;
  const rec = data as Record<string, unknown>;
  const from = asString(rec.from);
  const to = asAddressList(rec.to);
  if (!from || to.length === 0) return null;

  const attachments: InboundAttachment[] = [];
  if (Array.isArray(rec.attachments)) {
    for (const a of rec.attachments) {
      if (!a || typeof a !== "object") continue;
      const arec = a as Record<string, unknown>;
      const filename = asString(arec.filename);
      const content = asString(arec.content);
      if (!filename || !content) continue;
      attachments.push({
        filename,
        contentType: asString(arec.content_type),
        contentBase64: content,
      });
    }
  }

  return {
    provider: "resend",
    from,
    to,
    subject: asString(rec.subject) ?? "",
    text: asString(rec.text),
    messageId: asString(rec.email_id),
    attachments,
  };
}

export function normalizeInboundEmail(body: unknown): NormalizedInboundEmail | null {
  if (!body || typeof body !== "object") return null;
  const rec = body as Record<string, unknown>;
  if (typeof rec.From === "string") return normalizePostmark(rec);
  if (rec.data && typeof rec.data === "object") return normalizeResend(rec);
  return null;
}

// Pulls the workspace slug out of recipient addresses of the form
// <slug>@in.<domain> (optional +deal tag). When INBOUND_EMAIL_DOMAIN is set,
// only that exact domain matches; otherwise any "in." subdomain is accepted.
export function extractAliasSlug(
  addresses: string[],
  inboundDomain = process.env.INBOUND_EMAIL_DOMAIN,
): string | null {
  return parseInboundAlias(addresses, inboundDomain)?.slug ?? null;
}
