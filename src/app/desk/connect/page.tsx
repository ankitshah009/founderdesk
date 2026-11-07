import type { Metadata } from "next";
import { MonoLabel } from "@/components/ui";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "MCP & integrations", robots: { index: false } };

function Code({ children }: { children: string }) {
  return <pre className="overflow-x-auto rounded-lg border border-line bg-panel-2 p-4 font-mono text-xs leading-relaxed text-fg-2">{children}</pre>;
}

export default function ConnectPage() {
  const url = `${env().APP_URL.replace(/\/$/, "")}/api/mcp`;
  const configured = Boolean(env().MCP_API_KEY);
  return (
    <div className="max-w-3xl space-y-8 px-4 py-8 md:px-10 md:py-10">
      <div>
        <MonoLabel>MCP server</MonoLabel>
        <h1 className="mt-3 text-3xl font-medium tracking-[-0.025em] text-fg">Drive FounderDesk from an agent</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Tools: <code>submit_brief</code>, <code>get_order</code>, <code>list_orders</code>, <code>get_draft</code>, <code>answer_question</code>. There is deliberately no approval tool — publishing
          requires the founder&apos;s action on the private review page.
        </p>
        {!configured ? <p className="mt-3 text-sm text-amber">Set MCP_API_KEY to enable the endpoint. Requests without the bearer key are rejected.</p> : null}
      </div>
      <section className="space-y-3">
        <p className="text-sm text-fg">Claude Code</p>
        <Code>{`claude mcp add --transport http founderdesk ${url} \\\n  --header "Authorization: Bearer $FOUNDERDESK_MCP_KEY"`}</Code>
      </section>
      <section className="space-y-3">
        <p className="text-sm text-fg">Muse and other stdio-only clients (via mcp-remote)</p>
        <Code>{`"mcpServers": {
  "founderdesk": {
    "transport": "stdio",
    "command": "npx",
    "args": ["-y", "mcp-remote", "${url}", "--header", "Authorization: Bearer \${FOUNDERDESK_MCP_KEY}"]
  }
}`}</Code>
      </section>
      <section className="space-y-3">
        <p className="text-sm text-fg">Webhooks to register</p>
        <Code>{`AgentMail  message.received  → ${env().APP_URL.replace(/\/$/, "")}/api/webhooks/agentmail
Stripe     checkout.session.completed,
           checkout.session.async_payment_succeeded → ${env().APP_URL.replace(/\/$/, "")}/api/webhooks/stripe`}</Code>
      </section>
    </div>
  );
}
