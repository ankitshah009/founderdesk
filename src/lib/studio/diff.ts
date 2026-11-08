/**
 * Word-level diff between two versions of an article (for version history).
 * Diffs paragraph by paragraph first, then words within changed paragraphs,
 * which keeps the LCS tables small for long articles.
 */

export type DiffPart = { type: "same" | "add" | "del"; text: string };

function lcsDiff<T>(a: T[], b: T[], eq: (x: T, y: T) => boolean): Array<{ type: DiffPart["type"]; a?: T; b?: T }> {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i]![j] = eq(a[i]!, b[j]!) ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const out: Array<{ type: DiffPart["type"]; a?: T; b?: T }> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (eq(a[i]!, b[j]!)) {
      out.push({ type: "same", a: a[i], b: b[j] });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) out.push({ type: "del", a: a[i++] });
    else out.push({ type: "add", b: b[j++] });
  }
  while (i < n) out.push({ type: "del", a: a[i++] });
  while (j < m) out.push({ type: "add", b: b[j++] });
  return out;
}

function merge(parts: DiffPart[]): DiffPart[] {
  const out: DiffPart[] = [];
  for (const p of parts) {
    const last = out[out.length - 1];
    if (last && last.type === p.type) last.text += p.text;
    else out.push({ ...p });
  }
  return out;
}

const tokens = (s: string) => s.split(/(\s+)/).filter((t) => t.length);

export function diffWords(a: string, b: string): DiffPart[] {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.length * tb.length > 1_500_000) return [{ type: "del", text: a }, { type: "add", text: b }];
  return merge(lcsDiff(ta, tb, (x, y) => x === y).map((d) => ({ type: d.type, text: (d.type === "add" ? d.b : d.a)! })));
}

/** Paragraph-aligned diff of two Markdown documents. Each entry is one paragraph's parts. */
export function diffDocuments(a: string, b: string): Array<{ kind: "same" | "changed" | "added" | "removed"; parts: DiffPart[] }> {
  const pa = a.replace(/\r\n/g, "\n").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const pb = b.replace(/\r\n/g, "\n").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const ops = lcsDiff(pa, pb, (x, y) => x === y);
  const out: Array<{ kind: "same" | "changed" | "added" | "removed"; parts: DiffPart[] }> = [];
  for (let k = 0; k < ops.length; k++) {
    const op = ops[k]!;
    const next = ops[k + 1];
    if (op.type === "same") out.push({ kind: "same", parts: [{ type: "same", text: op.a! }] });
    else if (op.type === "del" && next?.type === "add") {
      out.push({ kind: "changed", parts: diffWords(op.a!, next.b!) });
      k++;
    } else if (op.type === "del") out.push({ kind: "removed", parts: [{ type: "del", text: op.a! }] });
    else out.push({ kind: "added", parts: [{ type: "add", text: op.b! }] });
  }
  return out;
}

export function diffStats(a: string, b: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const p of diffDocuments(a, b))
    for (const part of p.parts) {
      const n = part.text.split(/\s+/).filter(Boolean).length;
      if (part.type === "add") added += n;
      if (part.type === "del") removed += n;
    }
  return { added, removed };
}
