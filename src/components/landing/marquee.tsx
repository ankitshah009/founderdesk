import { cn } from "../ui";

const INTEGRATIONS: Array<[string, string]> = [
  ["AgentMail", "Inbox and replies"],
  ["Stripe", "Checkout"],
  ["Neon", "State and evidence"],
  ["Naïve", "Editorial agents"],
  ["Monid", "Research tools"],
  ["Mobile Run", "Phone checks"],
  ["OpenAI", "Transcripts and images"],
  ["WordPress", "Publishing"],
  ["Ghost", "Publishing"],
  ["Webflow", "Publishing"],
  ["X", "Posts and threads"],
  ["LinkedIn", "Posts"],
];

function Group({ copy }: { copy?: boolean }) {
  return (
    <ul data-copy={copy ? "" : undefined} aria-hidden={copy || undefined} className="flex shrink-0">
      {INTEGRATIONS.map(([name, role]) => (
        <li key={name} className="flex h-20 shrink-0 items-center gap-3 border-r border-line px-8">
          <span className="text-[17px] font-semibold tracking-[-0.02em] text-fg-2">{name}</span>
          <span className="text-xs text-subtle">{role}</span>
        </li>
      ))}
    </ul>
  );
}

/** Real integrations only. The second copy makes the loop seamless and is hidden from assistive tech. */
export function IntegrationMarquee({ className }: { className?: string }) {
  return (
    <div className={cn("lv-marquee-wrap lv-fade-x overflow-hidden", className)}>
      <div className="lv-marquee flex w-max">
        <Group />
        <Group copy />
      </div>
    </div>
  );
}
