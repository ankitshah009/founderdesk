import { NextResponse } from "next/server";
import { after } from "next/server";
import { verifyAgentMailWebhook } from "@/lib/integrations/agentmail";
import { persistEvent, processInboundEvent } from "@/lib/workflow/intake";
import { runWork } from "@/lib/workflow/run";

export const maxDuration = 60;

/**
 * AgentMail message.received webhook. The handler only verifies and persists
 * the event, then returns; turning it into a job or a founder reply — and
 * all editorial work — happens after the response.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  let verified: { payload: unknown; deliveryId: string };
  try {
    verified = verifyAgentMailWebhook(raw, req.headers);
  } catch (err) {
    return NextResponse.json({ error: `Signature verification failed: ${(err as Error).message}` }, { status: 400 });
  }
  const type = (verified.payload as { event_type?: string }).event_type ?? "unknown";
  const event = await persistEvent("agentmail", verified.deliveryId, type, verified.payload);
  if (event) {
    after(async () => {
      try {
        await processInboundEvent(event.id);
        await runWork();
      } catch (err) {
        console.error("[founderdesk] inbound processing failed", err);
      }
    });
  }
  return NextResponse.json({ received: true, duplicate: !event });
}
