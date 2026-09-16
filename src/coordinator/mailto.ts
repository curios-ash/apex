import type { ActionDraftPayload } from "./types";

// Approved email drafts open in the owner's own mail client via mailto: —
// Apex never sends. encodeURIComponent (not URLSearchParams' form encoding)
// so newlines and spaces survive as %0A/%20 in every mail client.
// Returns null for owner-facing reminders (no subject = nothing to mail).
export function buildMailtoHref(draft: {
  to: string | null;
  subject: string | null;
  body: string;
}): string | null {
  if (!draft.subject) return null;
  const subject = encodeURIComponent(draft.subject);
  const body = encodeURIComponent(draft.body);
  return `mailto:${draft.to ?? ""}?subject=${subject}&body=${body}`;
}

export function mailtoFor(payload: ActionDraftPayload): string | null {
  return buildMailtoHref({ to: payload.to, subject: payload.subject, body: payload.body });
}
