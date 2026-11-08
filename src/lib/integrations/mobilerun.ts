import { env } from "@/lib/env";
import { requestJson } from "./http";

/**
 * Mobile Run (Droidrun Cloud): POST /tasks dispatches an agent on a real
 * Android device; GET /tasks/{id}/status reports the outcome. There is no
 * webhook, so the dispatcher polls. Task acceptance alone never counts as a
 * check: we require a terminal status, `succeeded`, and structured output.
 */

function base() {
  const e = env();
  if (!e.MOBILERUN_API_KEY) throw new Error("MOBILERUN_API_KEY is not set");
  if (!e.MOBILERUN_DEVICE_ID) throw new Error("MOBILERUN_DEVICE_ID is not set");
  return { url: e.MOBILERUN_BASE_URL.replace(/\/$/, ""), token: e.MOBILERUN_API_KEY, deviceId: e.MOBILERUN_DEVICE_ID };
}

export const MOBILE_CHECK_SCHEMA = {
  type: "object",
  properties: {
    pageLoaded: { type: "boolean" },
    headlineVisible: { type: "boolean", description: "The expected headline text is visible on screen" },
    scrolledToEnd: { type: "boolean", description: "You scrolled through the whole article" },
    sourceLinksPresent: { type: "boolean", description: "The Sources section lists at least one link" },
    layoutProblems: {
      type: "array",
      items: { type: "string" },
      description: "Concrete problems: horizontal scrolling, clipped or overlapping text, unreadably small text, broken images",
    },
  },
  required: ["pageLoaded", "headlineVisible", "scrolledToEnd", "sourceLinksPresent", "layoutProblems"],
} as const;

export function mobileCheckTask(url: string, headline: string): string {
  return [
    `Open Chrome and go to ${url}`,
    `Confirm the article headline "${headline}" is visible near the top of the page.`,
    "Scroll slowly through the entire article to the end, including the Sources section.",
    "Check that the Sources section contains at least one link.",
    "Note any layout problems: content wider than the screen (horizontal scrolling), clipped or overlapping text, text too small to read, or broken images.",
    "Report exactly what you observed. Do not tap any links.",
  ].join("\n");
}

export async function runTask(args: { task: string; idempotencyKey: string; outputSchema?: Record<string, unknown>; maxSteps?: number }) {
  const { url, token, deviceId } = base();
  const { data } = await requestJson<{ id: string; status: string; streamUrl: string | null }>("mobilerun", `${url}/tasks`, {
    token,
    headers: { "idempotency-key": args.idempotencyKey.slice(0, 128) },
    body: {
      task: args.task,
      deviceId,
      outputSchema: args.outputSchema ?? MOBILE_CHECK_SCHEMA,
      maxSteps: args.maxSteps ?? 40,
      executionTimeout: 600,
      vision: true,
      recordingEnabled: true,
    },
  });
  return data;
}

export type TaskStatus = {
  status: "prepared" | "queued" | "created" | "running" | "cancelling" | "completed" | "failed" | "cancelled";
  message?: string | null;
  output?: unknown;
  steps?: number | null;
  succeeded?: boolean | null;
  recordingId?: string | null;
};

export async function getTaskStatus(id: string): Promise<TaskStatus> {
  const { url, token } = base();
  const { data } = await requestJson<TaskStatus>("mobilerun", `${url}/tasks/${encodeURIComponent(id)}/status`, { token });
  return data;
}

export const TERMINAL_TASK = new Set(["completed", "failed", "cancelled"]);

export const INSTAGRAM_POST_SCHEMA = {
  type: "object",
  properties: {
    posted: { type: "boolean", description: "The carousel post was published successfully" },
    postUrl: { type: ["string", "null"], description: "The post's link, from Share > Copy link (https://www.instagram.com/p/...)" },
    problems: { type: "array", items: { type: "string" } },
  },
  required: ["posted", "postUrl", "problems"],
} as const;

export function instagramPostTask(imageUrls: string[], slides: string[], caption: string): string {
  return [
    "Publish an Instagram carousel post from the Instagram account that is already signed in on this phone. Do not sign in or out, and do not change any settings.",
    "1. In Chrome, open each image URL below in order and save each image to the gallery (long-press the image, then Download image):",
    ...imageUrls.map((u, i) => `   ${i + 1}. ${u}`),
    "2. Open Instagram, tap + to create a new post, choose 'Select multiple', and select those images in the same order.",
    `3. Use this caption exactly:\n${caption}`,
    `4. (For reference, the slide text is: ${slides.join(" | ")})`,
    "5. Share the post. Then open it, tap the three dots or Share, choose Copy link, and report that link as postUrl.",
    "If anything blocks you (a login prompt, a verification screen, a dialog you cannot dismiss), stop and report it in problems with posted=false. Never post twice.",
  ].join("\n");
}

/* ── Social accounts on the phone ─────────────────────────────────────────── */

export type PhonePlatform = "x" | "linkedin" | "instagram";

const APP: Record<PhonePlatform, { app: string; profile: string; urlHint: string }> = {
  x: { app: "X (Twitter)", profile: "tap your profile picture, then Profile", urlHint: "https://x.com/<handle>/status/<id>" },
  linkedin: { app: "LinkedIn", profile: "tap your profile picture, then View profile", urlHint: "https://www.linkedin.com/feed/update/urn:li:activity:<id>/ or https://www.linkedin.com/posts/..." },
  instagram: { app: "Instagram", profile: "tap the profile icon at the bottom right", urlHint: "https://www.instagram.com/p/<id>/" },
};

export const ACCOUNT_CHECK_SCHEMA = {
  type: "object",
  properties: {
    signedIn: { type: "boolean", description: "An account is signed in to the app" },
    handle: { type: ["string", "null"], description: "The signed-in account's handle or profile name exactly as shown" },
    problems: { type: "array", items: { type: "string" } },
  },
  required: ["signedIn", "handle", "problems"],
} as const;

/** Read-only: confirm which account is signed in. Never posts, follows or changes anything. */
export function accountCheckTask(p: PhonePlatform): string {
  const a = APP[p];
  return [
    `Open the ${a.app} app on this phone.`,
    `If it shows a sign-in screen, stop and report signedIn=false. Do not sign in or create an account.`,
    `Otherwise ${a.profile} and read the account's handle (for example @name) or profile name exactly as shown.`,
    "Report what you saw. Do not post, like, follow, message or change any setting.",
  ].join("\n");
}

export const SOCIAL_POST_SCHEMA = {
  type: "object",
  properties: {
    posted: { type: "boolean", description: "The post was published successfully" },
    postUrl: { type: ["string", "null"], description: "The published post's link, from Share > Copy link" },
    problems: { type: "array", items: { type: "string" } },
  },
  required: ["posted", "postUrl", "problems"],
} as const;

/** X: one post, or a thread where each post replies to the previous one. */
export function xPostTask(posts: string[]): string {
  return [
    "Publish on X from the account already signed in to the X app on this phone. Do not sign in or out, and do not change settings.",
    posts.length > 1 ? `Post this as a thread of ${posts.length} posts: write the first post, then tap 'Add' (+) to add each next post to the same thread before posting.` : "Write one post.",
    ...posts.map((t, i) => `--- Post ${i + 1} (type exactly, including line breaks):\n${t}`),
    "Tap Post once. Then open the first post you just published, tap Share, choose Copy link, and report that link as postUrl.",
    "If anything blocks you (sign-in prompt, verification, a dialog you cannot dismiss), stop and report it in problems with posted=false. Never post twice.",
  ].join("\n");
}

export function linkedinPostTask(text: string): string {
  return [
    "Publish a LinkedIn post from the account already signed in to the LinkedIn app on this phone. Do not sign in or out, and do not change settings.",
    "Tap Post (or 'Start a post'), set visibility to Anyone, and type exactly this text, keeping the line breaks:",
    text,
    "Tap Post once. Then open the published post, tap the three dots or Share, choose Copy link to post, and report that link as postUrl.",
    "If anything blocks you, stop and report it in problems with posted=false. Never post twice.",
  ].join("\n");
}

export const POST_URL: Record<PhonePlatform, RegExp> = {
  x: /^https:\/\/(www\.)?(x|twitter)\.com\/[^/]+\/status\/\d+/,
  linkedin: /^https:\/\/(www\.)?linkedin\.com\/(feed\/update|posts)\//,
  instagram: /^https:\/\/(www\.)?instagram\.com\/(p|reel)\//,
};

export const PHONE_APP = APP;
