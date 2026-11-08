import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getDb, resetDbForTests } from "@/lib/db/client";
import { drafts, jobs, publications, reviews } from "@/lib/db/schema";
import { articleHtml, ghostJwt, markdownToHtml } from "@/lib/destinations/cms";
import { resetEnvCache } from "@/lib/env";
import { connectSimulated, resolveCredentials, upsertAccount } from "@/lib/social/accounts";
import { approvalDestinations } from "@/lib/social/destinations";
import { STATE_TTL_MS, signState, verifyState } from "@/lib/social/oauth";
import { approveDraft } from "@/lib/workflow/publish";
import { runWork } from "@/lib/workflow/run";

vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));

/** The public web is the database; any other network call fails the test. */
const offSite: string[] = [];
function stubNetwork() {
  vi.stubGlobal("fetch", async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith("http://founderdesk.test/a/")) {
      offSite.push(url);
      return new Response("blocked in tests", { status: 599 });
    }
    const slug = url.split("/a/")[1]!;
    const db = await getDb();
    const [pub] = await db.select().from(publications).where(eq(publications.slug, slug));
    if (!pub) return new Response("not found", { status: 404 });
    const [d] = await db.select().from(drafts).where(eq(drafts.id, pub.draftId));
    return new Response(`<html><head><meta name="founderdesk:content-hash" content="${pub.contentHash}"></head><body><h1>${d!.title}</h1></body></html>`, { status: 200 });
  });
}

async function readyJob(email: string) {
  const { createJob } = await import("@/lib/workflow/intake");
  const db = await getDb();
  const job = await createJob({ channel: "web", founderEmail: email, subject: "Social", body: "I want to write about why founders should own their channels. My audience is founders." });
  const [d] = await db
    .insert(drafts)
    .values({ jobId: job.id, version: 1, author: "writer", title: `Own your channels ${email}`, dek: "D", bodyMarkdown: "## Why\n\n" + "Body text. ".repeat(40), announcement: "New post {{url}}", contentHash: `h-${email}` })
    .returning();
  await db.insert(reviews).values({ jobId: job.id, draftId: d!.id, outcome: "READY_FOR_APPROVAL", summary: "ok", findings: [] });
  await db.update(jobs).set({ stage: "READY_FOR_APPROVAL", paymentStatus: "paid" }).where(eq(jobs.id, job.id));
  return { job, draft: d! };
}

beforeAll(async () => {
  await resetDbForTests();
  stubNetwork();
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await resetDbForTests();
});

describe("OAuth state", () => {
  const base = { p: "x" as const, e: "dana@founder.test", v: "verifier", n: "nonce" };

  it("round-trips a signed state for the right provider", () => {
    const s = verifyState(signState(base), "x");
    expect(s).toMatchObject(base);
  });

  it("rejects tampering, the wrong provider, and expiry", () => {
    const token = signState(base);
    const [body, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...base, e: "attacker@evil.test", exp: Date.now() + 60_000 })).toString("base64url");
    expect(verifyState(`${forged}.${sig}`, "x")).toBeNull();
    expect(verifyState(`${body}.${sig!.slice(0, -2)}xx`, "x")).toBeNull();
    expect(verifyState(token, "linkedin")).toBeNull();
    expect(verifyState(token, "x", Date.now() + STATE_TTL_MS + 1000)).toBeNull();
    expect(verifyState("garbage", "x")).toBeNull();
  });
});

describe("Ghost Admin JWT", () => {
  it("is HS256 with kid, aud /admin/ and a 5-minute expiry, signed with the hex secret", () => {
    const secret = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";
    const now = 1_700_000_000_000;
    const jwt = ghostJwt(`keyid123:${secret}`, now);
    const [h, p, s] = jwt.split(".");
    expect(JSON.parse(Buffer.from(h!, "base64url").toString())).toEqual({ alg: "HS256", typ: "JWT", kid: "keyid123" });
    const payload = JSON.parse(Buffer.from(p!, "base64url").toString());
    expect(payload).toEqual({ iat: now / 1000, exp: now / 1000 + 300, aud: "/admin/" });
    expect(s).toBe(createHmac("sha256", Buffer.from(secret, "hex")).update(`${h}.${p}`).digest("base64url"));
    expect(() => ghostJwt("no-colon")).toThrow();
  });
});

describe("article HTML for CMSs", () => {
  it("escapes markup and links back to the canonical article", () => {
    const html = articleHtml({ dek: "A <dek>", bodyMarkdown: "## Head\n\nSome **bold** <script>x</script> [S1]\n\n- a\n- b" }, "https://fd.test/a/slug");
    expect(html).toContain('<link rel="canonical" href="https://fd.test/a/slug">');
    expect(html).toContain("<h2>Head</h2>");
    expect(html).toContain("<strong>bold</strong> &lt;script&gt;");
    expect(html).toContain('href="https://fd.test/a/slug#source-S1"');
    expect(html).toContain("<ul><li>a</li><li>b</li></ul>");
    expect(markdownToHtml("[x](javascript:alert(1))", "u")).not.toContain("<a");
  });
});

describe("credential resolution", () => {
  it("prefers the founder's account, then the operator env token, then nothing", async () => {
    const email = "creds@founder.test";
    expect(await resolveCredentials(email, "x")).toBeNull();

    process.env.X_USER_ACCESS_TOKEN = "env-x-token";
    resetEnvCache();
    try {
      expect(await resolveCredentials(email, "x")).toMatchObject({ source: "env", accessToken: "env-x-token", simulated: false });
      await upsertAccount(email, "x", { externalUserId: "42", handle: "@dana" }, { accessToken: "founder-token", refreshToken: "r", expiresAt: new Date(Date.now() + 3600_000), scopes: "tweet.write" });
      const c = await resolveCredentials(email, "x");
      expect(c).toMatchObject({ source: "founder", accessToken: "founder-token", handle: "@dana", simulated: false });
      // Another founder's account is never used.
      expect(await resolveCredentials("someone-else@founder.test", "x")).toMatchObject({ source: "env" });
    } finally {
      delete process.env.X_USER_ACCESS_TOKEN;
      resetEnvCache();
    }
    // Instagram has no env token: Mobile Run is the publish step's own fallback.
    expect(await resolveCredentials(email, "instagram")).toBeNull();
  });
});

describe("approval destinations", () => {
  it("only allows connected destinations, and pre-ticks auto-post accounts", async () => {
    const email = "allow@founder.test";
    await connectSimulated(email, "linkedin");
    const offered = await approvalDestinations(email);
    expect(offered.find((d) => d.id === "linkedin")).toMatchObject({ simulated: true, autoPost: true, via: "founder" });
    expect(offered.find((d) => d.id === "linkedin")!.label).toMatch(/LinkedIn as allow · simulated/);
    expect(offered.some((d) => d.id === "x")).toBe(false);
    // Outside production with no CMS env, CMSs are offered as simulated.
    expect(offered.find((d) => d.id === "wordpress")).toMatchObject({ simulated: true, autoPost: false });

    const { job, draft } = await readyJob(email);
    const { destinations } = await approveDraft({ jobId: job.id, draftId: draft.id, contentHash: draft.contentHash, destinations: ["x", "linkedin", "wordpress", "instagram", "bogus"] });
    expect(destinations).toEqual(["web", "linkedin", "wordpress"]);
  });
});

describe("simulated accounts", () => {
  it("record publications without touching the network", async () => {
    const email = "sim@founder.test";
    await connectSimulated(email, "x");
    const { job, draft } = await readyJob(email);
    offSite.length = 0;
    await approveDraft({ jobId: job.id, draftId: draft.id, contentHash: draft.contentHash, destinations: ["x", "ghost"], xFormat: "single" });
    await runWork({ budgetMs: 10_000 });
    const db = await getDb();
    const pubs = await db.select().from(publications).where(eq(publications.jobId, job.id));
    const web = pubs.find((p) => p.destination === "web")!;
    const x = pubs.find((p) => p.destination === "x")!;
    const ghost = pubs.find((p) => p.destination === "ghost")!;
    expect(web.status).toBe("published");
    expect(x).toMatchObject({ status: "published", url: web.url });
    expect(x.externalId).toMatch(/^sim_x_[0-9a-f-]{36}$/);
    expect(x.verification?.detail).toBe("Simulated account — nothing was posted");
    expect(ghost.status).toBe("published");
    expect(ghost.externalId).toMatch(/^sim_ghost_/);
    expect(offSite).toEqual([]);
  });
});
