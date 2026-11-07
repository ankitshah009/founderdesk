import Link from "next/link";

/** FounderDesk mark: a page with its corner folded into an approval tick. */
export function Mark({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <path d="M5 3.5h9.5L19 8v12.5a.5.5 0 0 1-.5.5h-13a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5Z" fill="currentColor" />
      <path d="M14.5 3.5V8H19" fill="none" stroke="#000" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="m8.5 14 2.4 2.4 4.6-4.9" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <Link href="/" className="inline-flex items-center gap-2 text-[17px] font-semibold tracking-[-0.02em] text-fg">
      <Mark />
      FounderDesk
    </Link>
  );
}
