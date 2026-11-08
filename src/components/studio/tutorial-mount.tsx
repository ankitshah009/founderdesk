import { connection } from "next/server";
import { StudioTour, TutorialButton, type TourStep } from "@/components/studio/tour";
import { studioSession } from "@/lib/studio/session";
import { TOUR_COPY, setupSteps } from "@/lib/studio/setup";
import { founderJobs, getProfile, listKnowledge } from "@/lib/studio/store";
import { markTutorialSeen } from "@/app/studio/actions";

/**
 * The Studio tutorial, available on every Studio page. It opens by itself the
 * first time an account reaches the Studio after signing in or up (remembered
 * on the account, so it never nags again on another device), and the
 * Tutorial button replays it any time.
 */
export async function TutorialMount() {
  await connection();
  const session = await studioSession();
  if (!session) return null;
  const [profile, knowledge, jobs] = await Promise.all([getProfile(session.email), listKnowledge(session.email), founderJobs(session.email)]);
  const steps = setupSteps(profile, { samples: knowledge.filter((k) => k.kind === "sample").length, jobs: jobs.length });
  const tour: TourStep[] = steps.map((s) => ({ ...TOUR_COPY[s.key]!, target: s.tourTarget, href: s.href, done: s.done }));
  return (
    <>
      <StudioTour steps={tour} autoStart={!profile.setup?.tourSeen} onSeen={markTutorialSeen} />
      <TutorialButton className="mt-6 w-full justify-center max-md:hidden" />
    </>
  );
}
