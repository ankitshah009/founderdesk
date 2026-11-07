import type { ReactNode } from "react";

/**
 * A deliberately small Markdown renderer for article bodies. It produces React
 * elements (never raw HTML), so agent- or founder-written text cannot inject
 * markup. Supports ## / ### headings, paragraphs, - lists, > quotes, **bold**,
 * _italic_, [links](https://…) and [S1]-style citations.
 */

type Opts = { citeHref?: (ref: string) => string; sourceUrls?: Record<string, string | null> };

function inline(text: string, opts: Opts, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|_[^_]+_|\[[^\]]+\]\((https?:\/\/[^)\s]+)\)|\[(S\d+)\])/g;
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyPrefix}-${i++}`;
    if (tok.startsWith("**")) out.push(<strong key={key} className="font-semibold text-fg">{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("_")) out.push(<em key={key}>{tok.slice(1, -1)}</em>);
    else if (m[3]) {
      const ref = m[3];
      out.push(
        <a key={key} href={opts.citeHref ? opts.citeHref(ref) : `#source-${ref}`} className="ml-0.5 align-super text-[0.7em] font-medium text-accent-ink no-underline hover:underline" aria-label={`Source ${ref}`}>
          {ref}
        </a>,
      );
    } else {
      const label = tok.slice(1, tok.indexOf("]("));
      out.push(
        <a key={key} href={m[2]} className="underline decoration-white/30 underline-offset-2 hover:decoration-white" rel="noopener noreferrer nofollow" target="_blank">
          {label}
        </a>,
      );
    }
    last = m.index! + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source, opts = {}, skipSources = false }: { source: string; opts?: Opts; skipSources?: boolean }) {
  const blocks = source.replace(/\r\n/g, "\n").split(/\n{2,}/);
  const nodes: ReactNode[] = [];
  let skipping = false;
  blocks.forEach((raw, bi) => {
    const block = raw.trim();
    if (!block) return;
    const heading = block.match(/^(#{2,3})\s+(.+)$/);
    if (heading) {
      skipping = skipSources && /^sources$/i.test(heading[2]!.trim());
      if (skipping) return;
      const Tag = heading[1] === "##" ? "h2" : "h3";
      nodes.push(
        <Tag key={bi} className={Tag === "h2" ? "mt-10 mb-3 text-xl font-medium tracking-[-0.015em] text-fg" : "mt-6 mb-2 text-lg font-medium text-fg"}>
          {inline(heading[2]!, opts, `h${bi}`)}
        </Tag>,
      );
      return;
    }
    if (skipping) return;
    const lines = block.split("\n");
    if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) {
      nodes.push(
        <ul key={bi} className="my-4 space-y-2 pl-5 [&>li]:list-disc [&>li]:marker:text-subtle">
          {lines.map((l, li) => (
            <li key={li}>{inline(l.replace(/^\s*[-*•]\s+/, ""), opts, `l${bi}-${li}`)}</li>
          ))}
        </ul>,
      );
      return;
    }
    if (lines.every((l) => l.startsWith(">"))) {
      nodes.push(
        <blockquote key={bi} className="my-5 border-l-2 border-accent/60 pl-4 text-fg-2">
          {inline(lines.map((l) => l.replace(/^>\s?/, "")).join(" "), opts, `q${bi}`)}
        </blockquote>,
      );
      return;
    }
    nodes.push(
      <p key={bi} className="my-4">
        {inline(lines.join(" "), opts, `p${bi}`)}
      </p>,
    );
  });
  return <div className="text-[1.0625rem] leading-[1.75] text-fg-2">{nodes}</div>;
}
