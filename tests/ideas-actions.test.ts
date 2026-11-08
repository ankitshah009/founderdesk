import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";

const who = vi.hoisted(() => ({ email: "founder@example.com" as string | null }));

vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn(), connection: async () => {} }));
vi.mock("next/cache", () => ({ refresh: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
}));
vi.mock("@/lib/workflow/run", () => ({ kick: () => {} }));
vi.mock("@/lib/studio/session", async (orig) => {
  const real = await orig<typeof import("@/lib/studio/session")>();
  return {
    ...real,
    studioSession: async () => (who.email ? { email: who.email } : null),
    requireStudio: async () => {
      if (!who.email) throw new real.StudioAuthError("Sign in");
      return { email: who.email };
    },
  };
});

import { addOwnHook, addPost, chooseHook, createIdea, deletePost, importCsv, planIdea, setIdeaStatus } from "@/app/studio/ideas/actions";
import { captureScript, guessAuthor, nextTuesday, normalizeAuthor } from "@/components/ideas/capture-helpers";
import { AnalogPanel, AudiencePanel, ControversyPanel, HookTournamentPanel, ViralTwinPanel } from "@/components/ideas/panels";
import { RadarView } from "@/components/ideas/radar-view";
import { getDb, resetDbForTests } from "@/lib/db/client";
import { calendarEntries } from "@/lib/db/schema";
import { DEFAULT_PERSONAS } from "@/lib/studio/presets";
import { analogs, audiencePanel, controversyCredibility, generateHooks, hookTournament, trendRadar, viralTwin } from "@/lib/studio/ideas";
import { getIdea, listIdeas, listPosts } from "@/lib/studio/store";

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
async function redirectOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return (e as { url?: string }).url ?? "";
  }
  return "";
}

beforeAll(async () => {
  await resetDbForTests();
});

describe("capture helpers", () => {
  it("guesses handles and platforms from post URLs", () => {
    expect(guessAuthor("https://x.com/paulg/status/123")).toBe("@paulg");
    expect(guessAuthor("https://x.com/i/status/123")).toBeNull();
    expect(guessAuthor("https://www.linkedin.com/posts/jane-doe_growth-activity-1")).toBe("@jane-doe");
    expect(guessAuthor("https://www.linkedin.com/in/jane-doe/")).toBe("@jane-doe");
    expect(normalizeAuthor(" Me ")).toBe("me");
    expect(normalizeAuthor("paulg")).toBe("@paulg");
    expect(nextTuesday(new Date("2026-11-08T10:00:00Z"))).toBe("2026-11-10");
    expect(nextTuesday(new Date("2026-11-10T10:00:00Z"))).toBe("2026-11-17");
  });

  it("builds a bookmarklet that parses as JavaScript and points at this app", () => {
    const href = captureScript("http://localhost:3001/");
    expect(href.startsWith("javascript:")).toBe(true);
    const src = decodeURIComponent(href.slice("javascript:".length));
    expect(() => new Function(src)).not.toThrow();
    expect(src).toContain('"http://localhost:3001"');
    expect(src).toContain("/studio/ideas/capture?url=");
  });
});

describe("Idea Lab actions", () => {
  it("creates ideas, imports posts and keeps everything owner-scoped", async () => {
    const url = await redirectOf(createIdea(null, fd({ title: "Most seed startups hire sales too early", notes: "We hired an AE at $400k ARR. Close rate halved in 3 months.", platform: "linkedin", hooks: "We hired sales at $400k ARR.\n" })));
    expect(url).toMatch(/^\/studio\/ideas\/[0-9a-f-]{36}$/);
    const id = url.split("/").pop()!;

    const csv = await importCsv(
      null,
      fd({
        csv: 'text,author,platform,date,likes,comments,shares,followers\n"We hired our first AE too early. Pipeline doubled, close rate halved.",me,linkedin,2026-10-01,300,40,10,8000\n"Founder-led sales until $1M ARR. Here is why.",@jason,linkedin,2026-10-20,900,120,60,50000\n"3 lessons from our pricing change",,linkedin,2026-09-01,40,2,1,8000',
      }),
    );
    expect(csv?.ok).toMatch(/Imported 3 posts \(2 yours, 1 from creators\)/);
    expect(await addPost(null, fd({ author: "paulg", platform: "x", text: "Short", via: "manual" }))).toEqual({ error: expect.stringMatching(/text/) });
    expect(await addPost(null, fd({ author: "paulg", platform: "x", text: "Hiring sales early is the most common seed mistake.", likes: "1,200", followers: "abc" }))).toEqual({ error: expect.stringMatching(/whole numbers/) });
    expect((await addPost(null, fd({ author: "paulg", platform: "x", text: "Hiring sales early is the most common seed mistake.", likes: "1,200" })))?.ok).toMatch(/@paulg/);

    await addOwnHook(fd({ ideaId: id, hook: "Stop hiring sales before $1M ARR." }));
    await chooseHook(fd({ ideaId: id, hook: "Stop hiring sales before $1M ARR." }));
    expect((await getIdea(who.email!, id))!.hooks[0]).toBe("Stop hiring sales before $1M ARR.");

    await planIdea(fd({ ideaId: id }));
    const db = await getDb();
    const cal = await db.select().from(calendarEntries);
    expect(cal).toHaveLength(1);
    expect(cal[0]!.origin).toBe("founder");
    expect(new Date(`${cal[0]!.date}T00:00:00Z`).getUTCDay()).toBe(2);
    expect((await getIdea(who.email!, id))!.status).toBe("planned");

    // Another founder can't touch this idea or these posts.
    who.email = "intruder@example.com";
    await setIdeaStatus(fd({ ideaId: id, status: "archived" }));
    await deletePost(fd({ postId: (await listPosts("founder@example.com"))[0]!.id }));
    expect(await listIdeas("intruder@example.com")).toHaveLength(0);
    who.email = "founder@example.com";
    expect((await getIdea(who.email, id))!.status).toBe("planned");
    expect(await listPosts(who.email)).toHaveLength(4);

    // Signed out: form actions report it instead of throwing.
    who.email = null;
    expect(await createIdea(null, fd({ title: "Anything at all here" }))).toEqual({ error: expect.stringMatching(/Sign in/) });
    who.email = "founder@example.com";
  });

  it("renders every analysis panel from real tool output", async () => {
    const [idea] = await listIdeas(who.email!);
    const posts = await listPosts(who.email!);
    const text = `${idea!.title}. ${idea!.notes}`;
    const t = hookTournament({ hooks: generateHooks({ title: idea!.title, notes: idea!.notes }), ownHooks: idea!.hooks, posts, platform: idea!.platform });
    const html = [
      renderToStaticMarkup(createElement(ViralTwinPanel, { twin: viralTwin({ idea: text, hook: t.ranked[0]!.hook, platform: "linkedin", posts }) })),
      renderToStaticMarkup(createElement(ViralTwinPanel, { twin: viralTwin({ idea: text, hook: "x", platform: "linkedin", posts: [] }) })),
      renderToStaticMarkup(createElement(AudiencePanel, { panel: audiencePanel({ idea: text, hook: t.ranked[0]!.hook, personas: DEFAULT_PERSONAS, evidenceText: "" }) })),
      renderToStaticMarkup(createElement(AnalogPanel, { result: analogs(text, posts), hasPosts: true })),
      renderToStaticMarkup(createElement(HookTournamentPanel, { t, idea: idea! })),
      renderToStaticMarkup(createElement(RadarView, { radar: trendRadar({ idea: text, posts, signals: [], platform: "linkedin" }) })),
      renderToStaticMarkup(createElement(ControversyPanel, { result: controversyCredibility({ idea: text, evidence: [] }), evidenceCount: 0 })),
    ].join("");
    expect(html).toContain("Viral Twin Simulator");
    expect(html).toContain("Import posts");
    expect(html).toContain("Simulated panel");
    expect(html).toContain("Use this hook");
    expect(html).toContain("Champion");
    expect(html).toContain("General guidance");
    expect(html).toContain("Controversy vs. Credibility");
  });
});
