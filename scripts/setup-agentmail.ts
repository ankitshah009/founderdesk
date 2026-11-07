/**
 * Create the business inbox and its message.received webhook (idempotent).
 *
 *   pnpm setup:agentmail -- --username desk --display "FounderDesk"
 *
 * Prints the env lines to add: AGENTMAIL_INBOX_ID and AGENTMAIL_WEBHOOK_SECRET.
 */
import { parseArgs } from "node:util";
import { createInbox, createWebhook } from "../src/lib/integrations/agentmail";
import { env } from "../src/lib/env";

const { values } = parseArgs({
  options: { username: { type: "string" }, display: { type: "string", default: "FounderDesk" } },
});

async function main() {
  const e = env();
  if (!e.AGENTMAIL_API_KEY) throw new Error("Set AGENTMAIL_API_KEY first.");
  if (e.APP_URL.includes("localhost")) {
    console.warn("APP_URL is localhost — AgentMail cannot reach it. Use a public URL (deployment or tunnel) for the webhook.");
  }
  const inbox = await createInbox({ username: values.username, displayName: values.display, clientId: "founderdesk-main-inbox" });
  console.log(`Inbox: ${inbox.inbox_id}`);
  const hook = await createWebhook({ url: `${e.APP_URL.replace(/\/$/, "")}/api/webhooks/agentmail`, inboxIds: [inbox.inbox_id], clientId: "founderdesk-main-webhook" });
  console.log("\nAdd to your environment:");
  console.log(`AGENTMAIL_INBOX_ID=${inbox.inbox_id}`);
  if (hook.secret) console.log(`AGENTMAIL_WEBHOOK_SECRET=${hook.secret}`);
  else console.log("AGENTMAIL_WEBHOOK_SECRET=<copy the signing secret from the AgentMail console for this webhook>");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
