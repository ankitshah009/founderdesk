import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { appSecret } from "@/lib/env";

export type LinkPurpose = "review" | "order" | "free";

type Payload = { j: string; p: LinkPurpose; e: number };

const b64url = (buf: Buffer | string) => Buffer.from(buf).toString("base64url");

function sign(data: string): string {
  return createHmac("sha256", appSecret()).update(data).digest("base64url");
}

/**
 * Private links (review page, order page) carry a signed, expiring token
 * rather than a bare job ID, so knowing a job's UUID is not enough to view or
 * approve it.
 */
export function signLink(jobId: string, purpose: LinkPurpose, ttlDays = 30): string {
  const payload: Payload = { j: jobId, p: purpose, e: Math.floor(Date.now() / 1000) + ttlDays * 86400 };
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

export function verifyLink(token: string, purpose: LinkPurpose): string | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Payload;
    if (payload.p !== purpose) return null;
    if (payload.e < Math.floor(Date.now() / 1000)) return null;
    return payload.j;
  } catch {
    return null;
  }
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** The hash an approval is bound to: exactly what will be published. */
export function draftContentHash(d: { title: string; dek: string; bodyMarkdown: string; announcement: string }): string {
  return sha256(JSON.stringify([d.title, d.dek, d.bodyMarkdown, d.announcement]));
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
