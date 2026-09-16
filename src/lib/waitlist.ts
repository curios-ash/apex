const EMAIL_MAX_LENGTH = 254;
// Intentionally pragmatic: waitlist capture, not RFC 5322 completeness.
const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export function normalizeEmail(input: unknown): string {
  return typeof input === "string" ? input.trim().toLowerCase() : "";
}

export function isValidEmail(email: string): boolean {
  if (email.length === 0 || email.length > EMAIL_MAX_LENGTH) return false;
  const [local, domain] = email.split("@");
  if (!local || !domain || local.length > 64) return false;
  return EMAIL_PATTERN.test(email);
}
