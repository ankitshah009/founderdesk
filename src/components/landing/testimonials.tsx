import { cn } from "../ui";
import { TESTIMONIALS, type Testimonial } from "./testimonials-data";

function Card({ t }: { t: Testimonial }) {
  return (
    <figure className="flex w-[300px] shrink-0 flex-col rounded-xl border border-line bg-panel p-5 sm:w-[340px]">
      {t.sample ? <span className="mb-4 self-start rounded-md border border-dashed border-amber/40 px-2 py-0.5 font-mono text-[10.5px] text-amber">Sample quote — replace before launch</span> : null}
      <blockquote className="text-[15px] leading-relaxed text-fg">“{t.quote}”</blockquote>
      <figcaption className="mt-auto flex items-center gap-3 pt-5 text-sm">
        <span aria-hidden className="flex size-8 items-center justify-center rounded-full border border-line-strong text-xs text-muted">
          {t.role.charAt(0)}
        </span>
        <span className="leading-tight">
          <span className="block text-fg-2">{t.sample ? t.role : `${t.name}, ${t.role}`}</span>
          <span className="block text-xs text-subtle">
            {t.company} · {t.stage}
          </span>
        </span>
      </figcaption>
    </figure>
  );
}

function Row({ copy }: { copy?: boolean }) {
  return (
    <div data-copy={copy ? "" : undefined} aria-hidden={copy || undefined} className="flex shrink-0 gap-4 pr-4">
      {TESTIMONIALS.map((t, i) => (
        <Card key={i} t={t} />
      ))}
    </div>
  );
}

/** Auto-scrolling quotes. Pauses on hover or keyboard focus; static and wrapped for reduced motion. */
export function Testimonials({ className }: { className?: string }) {
  return (
    <div className={cn("lv-marquee-wrap lv-fade-x overflow-hidden", className)} role="region" tabIndex={0} aria-label="Founder quotes">
      <div className="lv-marquee lv-marquee-slow flex w-max items-stretch">
        <Row />
        <Row copy />
      </div>
    </div>
  );
}
