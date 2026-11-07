/**
 * The system architecture, drawn from the founder's whiteboard: Founder →
 * AgentMail / Stripe → App backend and MCP → Neon, Naïve, Monid, approval page
 * → live web issue → Mobile Run check → back to the backend.
 */

type Box = { id: string; x: number; y: number; w: number; h: number; label: string; sub?: string; pill?: boolean; accent?: boolean };

const boxes: Box[] = [
  { id: "founder", x: 120, y: 16, w: 150, h: 48, label: "Founder" },
  { id: "stripe", x: 330, y: 96, w: 170, h: 48, label: "Stripe Checkout" },
  { id: "agentmail", x: 110, y: 186, w: 170, h: 48, label: "AgentMail" },
  { id: "payment", x: 350, y: 194, w: 130, h: 32, label: "Payment event", pill: true },
  { id: "backend", x: 90, y: 286, w: 250, h: 56, label: "App backend and MCP", accent: true },
  { id: "neon", x: 16, y: 452, w: 200, h: 48, label: "Neon state and evidence" },
  { id: "naive", x: 244, y: 452, w: 200, h: 48, label: "Naïve editorial agents" },
  { id: "monid", x: 472, y: 452, w: 200, h: 48, label: "Monid research tools" },
  { id: "approval", x: 742, y: 452, w: 220, h: 48, label: "Founder approval page" },
  { id: "issue", x: 762, y: 538, w: 180, h: 44, label: "Live web issue" },
  { id: "mobile", x: 762, y: 618, w: 180, h: 44, label: "Mobile Run check" },
];

// [path, startArrow?, endArrow?]
const wires: Array<[string, boolean, boolean]> = [
  ["M195 64 V186", false, true],
  ["M240 64 V80 H415 V96", false, true],
  ["M415 144 V194", false, false],
  ["M415 226 V262 H300 V286", false, true],
  ["M195 234 V286", true, true],
  ["M116 342 V452", true, true],
  ["M160 342 V412 H344 V452", false, true],
  ["M230 342 V396 H572 V452", true, true],
  ["M300 342 V380 H852 V452", false, true],
  ["M852 500 V538", false, true],
  ["M852 582 V618", false, true],
  ["M942 640 H984 V362 H326 V342", false, true],
];

export function ArchitectureDiagram() {
  return (
    <div className="overflow-x-auto">
      <svg viewBox="0 0 1000 680" role="img" aria-labelledby="arch-title arch-desc" className="min-w-[720px] w-full">
        <title id="arch-title">FounderDesk architecture</title>
        <desc id="arch-desc">
          The founder emails AgentMail and pays through Stripe Checkout. The payment event and email both reach the app backend and MCP server, which keeps state and evidence in Neon,
          dispatches Naïve editorial agents, calls Monid research tools, and sends the founder an approval page. Approval publishes the live web issue, which Mobile Run checks on a phone and reports
          back to the backend.
        </desc>
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M1 1 L8 5 L1 9" fill="none" stroke="#8a8a8a" strokeWidth="1.4" />
          </marker>
        </defs>
        {wires.map(([d, s, e], i) => (
          <path key={i} d={d} fill="none" stroke="#5c5c5c" strokeWidth="1.2" strokeLinejoin="round" markerStart={s ? "url(#arrow)" : undefined} markerEnd={e ? "url(#arrow)" : undefined} />
        ))}
        {boxes.map((b) => (
          <g key={b.id}>
            <rect
              x={b.x}
              y={b.y}
              width={b.w}
              height={b.h}
              rx={b.pill ? b.h / 2 : 10}
              fill={b.accent ? "#141414" : "#0a0a0a"}
              stroke={b.accent ? "rgba(255,107,61,0.55)" : "rgba(255,255,255,0.16)"}
            />
            <text x={b.x + b.w / 2} y={b.y + b.h / 2 + 5} textAnchor="middle" fill={b.accent ? "#ff9b78" : "#edf2f5"} fontSize={b.pill ? 13 : 15} fontWeight={500} fontFamily="var(--font-inter), system-ui">
              {b.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
