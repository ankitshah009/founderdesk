import { describe, expect, it } from "vitest";
import type { Profile } from "@/lib/db/schema";
import { DEFAULT_PERSONAS } from "@/lib/studio/presets";
import { nextStep, setupSteps } from "@/lib/studio/setup";
import { EMPTY_STYLE } from "@/lib/studio/style";
import { analyzeVoice } from "@/lib/studio/voice";

const base = { brand: null, styleGuide: EMPTY_STYLE, personas: DEFAULT_PERSONAS, setup: {} } as unknown as Profile;
const done = (p: Profile, c = { samples: 0, jobs: 0 }) => Object.fromEntries(setupSteps(p, c).map((s) => [s.key, s.done]));

describe("Get set up", () => {
  it("starts with nothing done and points at the brand", () => {
    expect(Object.values(done(base)).some(Boolean)).toBe(false);
    expect(nextStep(setupSteps(base, { samples: 0, jobs: 0 }))!.key).toBe("brand");
  });

  it("strikes through each step as its page is filled in", () => {
    const p = { ...base, brand: { name: "Northwind" }, styleGuide: { ...EMPTY_STYLE, tone: "Plain" }, setup: { personasConfirmed: true } } as unknown as Profile;
    expect(done(p, { samples: 1, jobs: 1 })).toEqual({ brand: true, voice: true, style: true, personas: true, article: true });
    expect(nextStep(setupSteps(p, { samples: 1, jobs: 1 }))).toBeNull();
  });

  it("doesn't count the defaults as done when the database reorders their keys", () => {
    const reordered = DEFAULT_PERSONAS.map((x) => ({ avoid: x.avoid, id: x.id, cares: x.cares, name: x.name, description: x.description }));
    expect(done({ ...base, personas: reordered } as unknown as Profile).personas).toBe(false);
  });

  it("counts edited personas as done without the confirm button", () => {
    const p = { ...base, personas: DEFAULT_PERSONAS.slice(1) } as unknown as Profile;
    expect(done(p).personas).toBe(true);
  });

  it("learns a voice from a short sample", () => {
    expect(analyzeVoice(["We shipped it on Friday. It's small, but customers are already using it and telling us what to fix next."])).not.toBeNull();
    expect(analyzeVoice(["Too short."])).toBeNull();
  });
});
