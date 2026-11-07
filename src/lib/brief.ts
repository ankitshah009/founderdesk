/**
 * Turns a founder's free-form email (or web form) into the structured brief
 * the job stores: topic, audience, thesis, source URLs and publication
 * boundaries. This is deliberately deterministic — the acknowledgement is a
 * fixed-scope template and does not need an agent. The researcher refines the
 * thesis later with full context.
 */

export type Brief = {
  topic: string;
  audience: string | null;
  thesis: string | null;
  sourceUrls: string[];
  boundaries: string[];
  privateTerms: string[];
};

const URL_RE = /\bhttps?:\/\/[^\s<>()"'\]]+[^\s<>()"'\].,;:!?]/gi;

export function extractUrls(text: string): string[] {
  const found = text.match(URL_RE) ?? [];
  return [...new Set(found.map((u) => u.trim()))].slice(0, 12);
}

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return clean(m[1]);
  }
  return null;
}

function clean(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .replace(/^[\s:,-]+|[\s.,;:-]+$/g, "")
    .trim();
}

function stripSubjectPrefix(subject: string): string {
  return clean(subject.replace(/^(re|fwd?|fw)\s*:\s*/i, "").replace(/^(article|post|essay|issue)\s+(on|about)\s+/i, ""));
}

export function parseBrief(input: { subject?: string | null; body: string }): Brief {
  const body = input.body ?? "";
  const subject = input.subject ? stripSubjectPrefix(input.subject) : "";

  const thesis = firstMatch(body, [
    /\bI(?:'d| would)? (?:want|like) to (?:write|argue|explain) (?:about |that )?(.+?)(?:[.!?](?:\s|$)|\n)/i,
    /\bmy (?:thesis|argument|point) is(?: that)? (.+?)(?:[.!?](?:\s|$)|\n)/i,
    /\bthesis:\s*(.+?)(?:\n|$)/i,
  ]);

  const audience = firstMatch(body, [
    /\bmy audience is (.+?)(?:[.!?](?:\s|$)|\n)/i,
    /\baudience:\s*(.+?)(?:\n|$)/i,
    /\b(?:written|writing) for (.+?)(?:[.!?](?:\s|$)|\n)/i,
    /\bfor an audience of (.+?)(?:[.!?](?:\s|$)|\n)/i,
  ]);

  const boundaries: string[] = [];
  const boundaryRe = /[^.!?\n]*\b(?:keep|don't|do not|never|avoid|without)\b[^.!?\n]*\b(?:private|confidential|name|names|mention|share|disclose|public)\b[^.!?\n]*[.!?]?/gi;
  for (const m of body.matchAll(boundaryRe)) boundaries.push(clean(m[0]));

  const topic = subject || (thesis ? thesis.slice(0, 90) : clean(body.split("\n")[0] ?? "").slice(0, 90)) || "Untitled article";

  return {
    topic,
    audience,
    thesis,
    sourceUrls: extractUrls(body),
    boundaries: [...new Set(boundaries)].slice(0, 8),
    privateTerms: extractPrivateTerms(body, boundaries),
  };
}

/**
 * When a founder asks to keep customer names private, pull the capitalised
 * names they mention next to customer/pilot language so the reviewer can
 * verify none reach the published article.
 */
export function extractPrivateTerms(body: string, boundaries: string[]): string[] {
  const wantsPrivacy = boundaries.some((b) => /customer|client|company|partner|name/i.test(b));
  if (!wantsPrivacy) return [];
  const terms = new Set<string>();
  const NAME = "([A-Z][A-Za-z0-9&]+(?:\\s+[A-Z][A-Za-z0-9&]+){0,2})";
  const patterns = [
    // Keywords may start a sentence, names must stay capitalised: case-fold the keyword only.
    new RegExp(`\\b(?:[Pp]ilot|[Pp]ilots|[Pp]iloted|[Cc]ustomer|[Cc]ustomers|[Cc]lient|[Cc]lients|[Pp]artner|[Dd]eployment)\\s+(?:with|at|for|from|is|was|named|called)\\s+${NAME}`, "g"),
    new RegExp(`\\b${NAME}\\s+(?:piloted|was our (?:first )?(?:customer|pilot)|is a customer)`, "g"),
    new RegExp(`\\b(?:[Cc]ustomers?|[Cc]lients?)\\s*(?:like|such as|including|:)\\s+${NAME}(?:\\s*(?:,|and)\\s*${NAME})?(?:\\s*(?:,|and)\\s*${NAME})?`, "g"),
  ];
  const stop = new Set(["The", "Our", "We", "I", "A", "An", "This", "That", "SaaS", "AI", "B2B", "Please"]);
  for (const re of patterns) {
    for (const m of body.matchAll(re)) {
      for (const g of m.slice(1)) {
        if (g && !stop.has(g.split(" ")[0]!)) terms.add(g.trim());
      }
    }
  }
  return [...terms].slice(0, 12);
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/** Parse "Ada Lovelace <ada@example.com>" or a bare address. */
export function parseAddress(raw: string | null | undefined): { email: string; name: string | null } | null {
  if (!raw) return null;
  const m = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { email: m[2]!.trim().toLowerCase(), name: m[1]!.trim() || null };
  const bare = raw.trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(bare) ? { email: bare, name: null } : null;
}

/** The public slug an approved article will be published under. */
export function articleSlug(title: string, jobId: string): string {
  return `${slugify(title) || "article"}-${jobId.slice(0, 6)}`;
}
