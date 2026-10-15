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

export interface AddEmailsResult {
  /** The list after adding: existing first, new valid addresses after, no duplicates. */
  list: string[];
  invalid: string[];
  /** Valid addresses dropped because the list is already full. */
  overflow: string[];
}

/**
 * Adds the addresses typed or pasted into `text` (separated by commas, semicolons, spaces or new
 * lines) to `existing`. Invalid ones are reported and skipped, duplicates are ignored.
 */
export function addEmails(existing: string[], text: string, max: number): AddEmailsResult {
  const list = [...existing];
  const invalid: string[] = [];
  const overflow: string[] = [];
  for (const raw of text.split(/[\s,;]+/).filter(Boolean)) {
    const email = parseEmail(raw);
    if (!email) invalid.push(raw);
    else if (list.includes(email)) continue;
    else if (list.length >= max) overflow.push(email);
    else list.push(email);
  }
  return { list, invalid, overflow };
}
