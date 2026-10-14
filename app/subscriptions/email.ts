const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Normalised address, or null when it is not a plausible email (also caps length per RFC 5321). */
export function parseEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const email = normalizeEmail(input);
  return email.length <= 254 && EMAIL_RE.test(email) ? email : null;
}
