import { describe, expect, it } from "vitest";
import { Webhook } from "svix";
import { extractPrivateTerms, extractUrls, parseAddress, parseBrief, slugify } from "@/lib/brief";
import { assertPublicUrl, htmlToText } from "@/lib/extract";
import { fillTemplate, normalizeDocs } from "@/lib/integrations/monid";
import { judgeSession } from "@/lib/integrations/naive";
import { renderAnnouncement } from "@/lib/destinations/social";
import { draftContentHash, signLink, verifyLink } from "@/lib/security";
import { figures, resolveFigureFinding } from "@/lib/workflow/editorial";

describe("brief parsing", () => {
  it("extracts thesis, audience, URLs and boundaries", () => {
    const b = parseBrief({
      subject: "Re: Article on AI customer support",
      body: "I want to write about why founders should start with narrow support workflows. My audience is early-stage SaaS founders. Links: https://example.com/a, https://example.com/b. Please keep the customer names private.",
    });
    expect(b.topic).toBe("AI customer support");
    expect(b.thesis).toBe("why founders should start with narrow support workflows");
    expect(b.audience).toBe("early-stage SaaS founders");
    expect(b.sourceUrls).toEqual(["https://example.com/a", "https://example.com/b"]);
    expect(b.boundaries[0]).toMatch(/keep the customer names private/);
  });

  it("finds customer names only when the founder asks for privacy", () => {
    const body = "We piloted with Acme Robotics. Customers like Globex and Initech loved it.";
    expect(extractPrivateTerms(body, [])).toEqual([]);
    expect(extractPrivateTerms(body, ["keep customer names private"])).toEqual(expect.arrayContaining(["Acme Robotics", "Globex", "Initech"]));
  });

  it("parses addresses and URLs", () => {
    expect(parseAddress("Dana Reyes <Dana@Northwind.dev>")).toEqual({ email: "dana@northwind.dev", name: "Dana Reyes" });
    expect(parseAddress("not an address")).toBeNull();
    expect(extractUrls("see (https://x.com/a).")).toEqual(["https://x.com/a"]);
    expect(slugify("Why Founders Should Start Narrow!")).toBe("why-founders-should-start-narrow");
  });
});

describe("signed links", () => {
  it("round-trips and rejects tampering or the wrong purpose", () => {
    const t = signLink("job-1", "review");
    expect(verifyLink(t, "review")).toBe("job-1");
    expect(verifyLink(t, "order")).toBeNull();
    expect(verifyLink(`${t}x`, "review")).toBeNull();
    const [body] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ j: "job-2", p: "review", e: 9e9 })).toString("base64url");
    expect(verifyLink(`${forged}.${t.split(".")[1]}`, "review")).toBeNull();
    expect(body).toBeTruthy();
  });

  it("expires", () => {
    expect(verifyLink(signLink("job-1", "order", -1), "order")).toBeNull();
  });

  it("content hash changes with any published field", () => {
    const base = { title: "T", dek: "D", bodyMarkdown: "B", announcement: "A" };
    expect(draftContentHash(base)).not.toBe(draftContentHash({ ...base, announcement: "A2" }));
  });
});

describe("AgentMail webhook verification (Svix)", () => {
  it("accepts a correctly signed body and rejects a modified one", async () => {
    const secret = `whsec_${Buffer.from("founderdesk-test-secret-0123456789").toString("base64")}`;
    process.env.AGENTMAIL_WEBHOOK_SECRET = secret;
    const { resetEnvCache } = await import("@/lib/env");
    resetEnvCache();
    const { verifyAgentMailWebhook } = await import("@/lib/integrations/agentmail");
    const body = JSON.stringify({ event_type: "message.received", message: { inbox_id: "a@b.c" } });
    const id = "msg_1";
    const ts = new Date();
    const sig = new Webhook(secret).sign(id, ts, body);
    const headers = new Headers({ "svix-id": id, "svix-timestamp": String(Math.floor(ts.getTime() / 1000)), "svix-signature": sig });
    expect(verifyAgentMailWebhook(body, headers).deliveryId).toBe(id);
    expect(() => verifyAgentMailWebhook(body.replace("a@b.c", "x@y.z"), headers)).toThrow();
    delete process.env.AGENTMAIL_WEBHOOK_SECRET;
    resetEnvCache();
  });
});

describe("Stripe webhook verification", () => {
  it("verifies the signature against the raw body", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_dummy";
    const { resetEnvCache } = await import("@/lib/env");
    resetEnvCache();
    const { stripe, verifyStripeWebhook } = await import("@/lib/integrations/stripe");
    const payload = JSON.stringify({ id: "evt_1", object: "event", type: "checkout.session.completed", data: { object: {} } });
    const header = stripe().webhooks.generateTestHeaderString({ payload, secret: "whsec_test_dummy" });
    const event = await verifyStripeWebhook(payload, header);
    expect(event.id).toBe("evt_1");
    await expect(verifyStripeWebhook(payload.replace("evt_1", "evt_2"), header)).rejects.toThrow();
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    resetEnvCache();
  });
});

describe("provider result handling", () => {
  it("treats only end_turn with a structured result as a finished Naïve session", () => {
    const base = { id: "ses_1", stop_code: null, structured_output: { ok: true } };
    expect(judgeSession({ ...base, status: "running", stop_reason: null })).toEqual({ state: "running" });
    expect(judgeSession({ ...base, status: "idle", stop_reason: "end_turn" })).toEqual({ state: "done", output: { ok: true } });
    expect(judgeSession({ ...base, status: "idle", stop_reason: "awaiting_input" }).state).toBe("failed");
    expect(judgeSession({ ...base, status: "idle", stop_reason: "end_turn", structured_output: null }).state).toBe("failed");
  });

  it("normalises varied Monid provider outputs into documents", () => {
    const out = { data: { results: [{ url: "https://a.com", title: "A", text: "x".repeat(10) }, { link: "https://b.com", snippet: "b" }, { url: "https://a.com" }] } };
    const docs = normalizeDocs(out);
    expect(docs.map((d) => d.url)).toEqual(["https://a.com", "https://b.com"]);
    expect(fillTemplate('{"query":"{{query}}","n":5,"nested":["{{query}}"]}', { query: 'say "hi"' })).toEqual({ query: 'say "hi"', n: 5, nested: ['say "hi"'] });
  });

  it("extracts readable text from HTML", () => {
    const { title, text } = htmlToText("<html><head><title>T &amp; U</title><script>x()</script></head><body><nav>menu</nav><article><h1>Head</h1><p>Body&nbsp;text</p></article></body></html>");
    expect(title).toBe("T & U");
    expect(text).toBe("Head\nBody text");
  });

  it("refuses private network URLs (SSRF guard)", async () => {
    await expect(assertPublicUrl("http://127.0.0.1/admin")).rejects.toThrow();
    await expect(assertPublicUrl("http://169.254.169.254/latest")).rejects.toThrow();
    await expect(assertPublicUrl("http://localhost:3000")).rejects.toThrow();
    await expect(assertPublicUrl("file:///etc/passwd")).rejects.toThrow();
  });
});

describe("clarification loop", () => {
  const finding = {
    id: "f1",
    severity: "blocking" as const,
    kind: "figure_mismatch",
    claim: "We saw first-response time improved by 80% in six weeks.",
    passage: "Median first-response time improved by 60% across the pilot.",
    sourceId: "S1",
  };
  const reply = (text: string, attachmentSourceIds: string[] = []) => ({ messageId: null, text, receivedAt: "", attachmentSourceIds });

  it("distinguishes answers from unrelated replies", () => {
    expect(figures("up 80% and 3x, 12 percent")).toEqual(["80%", "3x", "12%"]);
    expect(resolveFigureFinding(finding, [reply("Can you do a newsletter version?")]).kind).toBe("unresolved");
    expect(resolveFigureFinding(finding, [reply("Use the supported figure.")]).kind).toBe("use_supported");
    expect(resolveFigureFinding(finding, [reply("Yes, 60% is correct, use that")]).kind).toBe("use_supported");
    expect(resolveFigureFinding(finding, [reply("80% is from our internal dashboard, we measured it")]).kind).toBe("founder_vouches");
    expect(resolveFigureFinding(finding, [reply("See the attached report", ["src-1"])]).kind).toBe("founder_vouches");
  });

  it("fits announcements to each network's length limit", () => {
    const url = "https://desk.example/a/why-narrow";
    const long = `${"word ".repeat(80)}{{url}}`;
    const out = renderAnnouncement(long, url, 280);
    expect(out.length).toBeLessThanOrEqual(280);
    expect(out.endsWith(url)).toBe(true);
  });
});

describe("reviewer questions", () => {
  it("quotes only the clause that carries the figure", async () => {
    const { metricClause } = await import("@/lib/workflow/editorial");
    expect(metricClause("We piloted with a pilot customer and saw first-response time improved by 80% in six weeks.", "80%")).toBe("first-response time improved by 80% in six weeks");
    expect(metricClause("Response time improved by 80%.", "80%")).toBe("Response time improved by 80%");
  });
});

describe("reviewer does not stall on minor questions", () => {
  it("turns the agent's founder questions into revisions, and never blocks on them at the cycle cap", async () => {
    const { decideOutcome } = await import("@/lib/workflow/editorial");
    const job = { founderReplies: [], openQuestions: [] } as never;
    const soft = [{ id: "agent-1-0", severity: "blocking" as const, kind: "unsupported_claim", claim: "x", question: "Which study?" }];
    expect(decideOutcome({ agentOutcome: "NEEDS_FOUNDER_INPUT", findings: soft, job, revisionCycles: 0, maxRevisionCycles: 2 }).outcome).toBe("NEEDS_REVISION");
    expect(decideOutcome({ agentOutcome: "NEEDS_FOUNDER_INPUT", findings: soft, job, revisionCycles: 2, maxRevisionCycles: 2 }).outcome).toBe("READY_FOR_APPROVAL");
  });

  it("asks only about a concrete figure conflict, and opens no new question after a reply", async () => {
    const { decideOutcome } = await import("@/lib/workflow/editorial");
    const fig = { id: "figure-1", severity: "blocking" as const, kind: "figure_mismatch", claim: "up 80%", passage: "up 60%", question: "Q1?" };
    const fresh = { founderReplies: [], openQuestions: [] } as never;
    expect(decideOutcome({ agentOutcome: null, findings: [fig], job: fresh, revisionCycles: 0, maxRevisionCycles: 2 }).outcome).toBe("NEEDS_FOUNDER_INPUT");
    const repliedOther = { founderReplies: [{ text: "thanks", messageId: null, receivedAt: "", attachmentSourceIds: [] }], openQuestions: ["Different?"] } as never;
    expect(decideOutcome({ agentOutcome: null, findings: [fig], job: repliedOther, revisionCycles: 0, maxRevisionCycles: 2 }).outcome).toBe("NEEDS_REVISION");
  });
});
