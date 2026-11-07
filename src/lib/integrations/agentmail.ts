import { Webhook } from "svix";
import { z } from "zod";
import { env } from "@/lib/env";
import { requestJson } from "./http";

/**
 * AgentMail: one inbox for the business. Founders email it; we reply in the
 * same thread so the whole job — acknowledgement, questions, review link,
 * published URL — reads as one conversation.
 *
 * Webhooks are delivered through Svix and verified against the raw body.
 */

function base() {
  const e = env();
  if (!e.AGENTMAIL_API_KEY) throw new Error("AGENTMAIL_API_KEY is not set");
  return { url: e.AGENTMAIL_BASE_URL.replace(/\/$/, ""), token: e.AGENTMAIL_API_KEY };
}

type SendResult = { message_id: string; thread_id: string };

export async function sendMessage(args: { inboxId: string; to: string; subject: string; text: string; html?: string; labels?: string[] }) {
  const { url, token } = base();
  const { data } = await requestJson<SendResult>("agentmail", `${url}/inboxes/${encodeURIComponent(args.inboxId)}/messages/send`, {
    token,
    body: { to: [args.to], subject: args.subject, text: args.text, html: args.html, labels: args.labels },
  });
  return data;
}

export async function replyToMessage(args: { inboxId: string; messageId: string; text: string; html?: string; labels?: string[] }) {
  const { url, token } = base();
  const { data } = await requestJson<SendResult>(
    "agentmail",
    `${url}/inboxes/${encodeURIComponent(args.inboxId)}/messages/${encodeURIComponent(args.messageId)}/reply`,
    { token, body: { text: args.text, html: args.html, labels: args.labels } },
  );
  return data;
}

/**
 * Attachments have their own retrieval flow. The endpoint may answer with the
 * bytes directly or with JSON carrying a short-lived download URL; handle both.
 */
export async function fetchAttachment(args: { inboxId: string; messageId: string; attachmentId: string }) {
  const { url, token } = base();
  const endpoint = `${url}/inboxes/${encodeURIComponent(args.inboxId)}/messages/${encodeURIComponent(args.messageId)}/attachments/${encodeURIComponent(args.attachmentId)}`;
  const res = await fetch(endpoint, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`AgentMail attachment HTTP ${res.status}`);
  const type = res.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const meta = (await res.json()) as { download_url?: string; content_type?: string };
    if (!meta.download_url) throw new Error("AgentMail attachment response had no download_url");
    const dl = await fetch(meta.download_url, { signal: AbortSignal.timeout(30_000) });
    if (!dl.ok) throw new Error(`Attachment download HTTP ${dl.status}`);
    return { bytes: new Uint8Array(await dl.arrayBuffer()), contentType: meta.content_type ?? dl.headers.get("content-type") ?? "" };
  }
  return { bytes: new Uint8Array(await res.arrayBuffer()), contentType: type };
}

export async function createInbox(args: { username?: string; displayName?: string; clientId: string }) {
  const { url, token } = base();
  const { data } = await requestJson<{ inbox_id: string }>("agentmail", `${url}/inboxes`, {
    token,
    body: { username: args.username, display_name: args.displayName, client_id: args.clientId },
  });
  return data;
}

export async function createWebhook(args: { url: string; inboxIds: string[]; clientId: string }) {
  const { url, token } = base();
  const { data } = await requestJson<{ webhook_id?: string; secret?: string }>("agentmail", `${url}/webhooks`, {
    token,
    body: { url: args.url, event_types: ["message.received"], inbox_ids: args.inboxIds, client_id: args.clientId },
  });
  return data;
}

const attachmentSchema = z.looseObject({
  attachment_id: z.string(),
  filename: z.string().nullish(),
  content_type: z.string().nullish(),
  size: z.number().nullish(),
});

const addressList = z.union([z.string(), z.array(z.string())]).nullish();

export const inboundSchema = z.object({
  event_type: z.string(),
  event_id: z.string().nullish(),
  message: z
    .object({
      inbox_id: z.string(),
      thread_id: z.string(),
      message_id: z.string(),
      from: z.union([z.string(), z.array(z.string())]).nullish(),
      to: addressList,
      subject: z.string().nullish(),
      text: z.string().nullish(),
      extracted_text: z.string().nullish(),
      attachments: z.array(attachmentSchema).nullish(),
    })
    .loose()
    .nullish(),
});

export type InboundEvent = z.infer<typeof inboundSchema>;

/**
 * Verify a Svix-signed AgentMail webhook against the exact raw body. Returns
 * the parsed payload and the delivery id (stable across retries) or throws.
 */
export function verifyAgentMailWebhook(rawBody: string, headers: Headers): { payload: unknown; deliveryId: string } {
  const secret = env().AGENTMAIL_WEBHOOK_SECRET;
  if (!secret) throw new Error("AGENTMAIL_WEBHOOK_SECRET is not set");
  const h = {
    "svix-id": headers.get("svix-id") ?? "",
    "svix-timestamp": headers.get("svix-timestamp") ?? "",
    "svix-signature": headers.get("svix-signature") ?? "",
  };
  // svix ≥2 verify() no longer returns the payload reliably; parse ourselves after it passes.
  new Webhook(secret).verify(rawBody, h);
  return { payload: JSON.parse(rawBody), deliveryId: h["svix-id"] };
}
