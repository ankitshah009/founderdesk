import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Card, PageHead, Skeleton } from "@/components/studio/shared";
import { Button, Chip } from "@/components/ui";
import { SOCIAL_PROVIDERS, type SocialAccount, type SocialProvider } from "@/lib/db/schema";
import { CMS, CMS_DESTINATIONS, cmsSimulated } from "@/lib/destinations/cms";
import { listAccounts } from "@/lib/social/accounts";
import { PhoneConnect } from "@/components/studio/phone-connect";
import { isLive } from "@/lib/env";
import { PROVIDER_LABEL, isProvider } from "@/lib/social/oauth";
import { studioSession } from "@/lib/studio/session";
import { disconnect, toggleAutoPost } from "./actions";

export const metadata: Metadata = { title: "Connections" };

export default function ConnectionsPage(props: PageProps<"/studio/connections">) {
  return (
    <Suspense fallback={<Skeleton />}>
      <Connections {...props} />
    </Suspense>
  );
}

const ROLE: Record<SocialProvider, string> = {
  x: "Announce approved articles as a post or thread",
  linkedin: "Share approved articles to your feed",
  instagram: "Carousel from your approved images (business or creator account)",
};

const code = "rounded bg-white/[0.06] px-1 py-px font-mono text-[11px] text-fg-2";

async function Connections({ searchParams }: PageProps<"/studio/connections">) {
  await connection();
  const session = await studioSession();
  if (!session) {
    return (
      <Card title="Connections">
        <p className="text-sm text-muted">
          Sign in to connect your accounts. <Link href="/studio" className="text-fg underline underline-offset-2">Go to the Studio</Link>
        </p>
      </Card>
    );
  }
  const sp = await searchParams;
  const accounts = await listAccounts(session.email);
  const connected = typeof sp.connected === "string" && isProvider(sp.connected) ? sp.connected : null;
  const error = typeof sp.error === "string" ? sp.error.slice(0, 200) : null;

  return (
    <>
      <PageHead
        label="Connections"
        title="Where your articles go"
        lede="Sign in to X, LinkedIn and Instagram on your Mobile Run phone, then check them here. Approved posts go out from the phone as you. Nothing posts without your approval: accounts with auto-post on are simply pre-ticked on the approval screen."
      />
      {connected ? (
        <p role="status" className="mb-6 rounded-lg border border-green/30 bg-green/10 px-3 py-2.5 text-sm text-green">
          {PROVIDER_LABEL[connected]} connected{sp.simulated ? " in simulated mode — nothing will actually be posted" : ""}.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mb-6 rounded-lg border border-red/30 bg-red/10 px-3 py-2.5 text-sm text-red">
          {error}
        </p>
      ) : null}

      <h2 className="mb-3 text-xs font-semibold tracking-[0.14em] text-muted uppercase">Social accounts</h2>
      <div className="grid gap-4 lg:grid-cols-3">
        {SOCIAL_PROVIDERS.map((p) => (
          <SocialCard key={p} provider={p} account={accounts.find((a) => a.provider === p) ?? null} />
        ))}
      </div>

      <h2 className="mt-10 mb-3 text-xs font-semibold tracking-[0.14em] text-muted uppercase">Your blog (CMS)</h2>
      <div className="grid gap-4 lg:grid-cols-3">
        {CMS_DESTINATIONS.map((id) => {
          const c = CMS[id];
          const live = c.configured();
          const sim = cmsSimulated(id);
          return (
            <Card key={id} title={c.label} aside={<Chip tone={live ? "green" : sim ? "blue" : "neutral"}>{live ? "Connected" : sim ? "Simulated" : "Not connected"}</Chip>}>
              <p className="text-sm text-muted">
                {live
                  ? "Approved articles can be cross-posted here, with a link back to the original."
                  : sim
                    ? "Offered at approval as a simulated destination in development — it records a publication without calling the network."
                    : "Not offered at approval until configured."}
              </p>
              {!live ? (
                <p className="mt-3 text-xs leading-relaxed text-subtle">
                  To go live, set {c.envVars.map((v, i) => (
                    <span key={v}>
                      {i ? ", " : ""}
                      <code className={code}>{v}</code>
                    </span>
                  ))}{" "}
                  on the server.
                </p>
              ) : null}
            </Card>
          );
        })}
      </div>
    </>
  );
}

const MOBILERUN_DEVICE_URL = "https://cloud.mobilerun.ai";

function SocialCard({ provider, account }: { provider: SocialProvider; account: SocialAccount | null }) {
  const phone = isLive("mobilerun");
  const viaPhone = account?.via === "mobilerun";
  const label = PROVIDER_LABEL[provider];
  const tone = account?.status === "connected" ? (account.simulated ? "blue" : "green") : account ? "amber" : "neutral";
  const status = !account ? "Not connected" : account.status === "connected" ? (account.simulated ? "Simulated" : "Connected") : account.status === "expired" ? "Expired" : "Revoked";
  return (
    <Card title={label} aside={<Chip tone={tone}>{status}</Chip>}>
      <p className="text-sm text-muted">{ROLE[provider]}</p>
      {account ? (
        <div className="mt-4 space-y-3">
          <div>
            <p className="text-sm text-fg">{account.handle}</p>
            <p className="mt-0.5 text-[11px] text-subtle">
              Connected {account.connectedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              {account.simulated ? " · simulated account, nothing is posted" : ""}
              {viaPhone ? " · posts from your Mobile Run phone" : ""}
            </p>
          </div>
          <form action={toggleAutoPost} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2">
            <input type="hidden" name="provider" value={provider} />
            {/* Unchecked boxes are omitted from the form, so the button submits the opposite of the current value. */}
            {account.autoPost ? null : <input type="hidden" name="autoPost" value="on" />}
            <span className="text-xs text-fg-2">
              Auto-post: <strong className="text-fg">{account.autoPost ? "on" : "off"}</strong>
              <span className="block text-[11px] text-subtle">{account.autoPost ? "Pre-ticked when you approve" : "Unticked when you approve"}</span>
            </span>
            <Button type="submit" variant="secondary" className="px-2.5 py-1 text-xs">
              Turn {account.autoPost ? "off" : "on"}
            </Button>
          </form>
          <div className="flex flex-wrap gap-2">
            <form action={disconnect}>
              <input type="hidden" name="provider" value={provider} />
              <Button type="submit" variant="ghost" className="px-2.5 py-1.5 text-xs">
                Disconnect
              </Button>
            </form>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {phone ? (
            <PhoneConnect provider={provider} label={label} deviceUrl={MOBILERUN_DEVICE_URL} />
          ) : (
            <p className="text-xs text-muted">Posting from your Mobile Run phone isn&apos;t switched on for this workspace yet.</p>
          )}
        </div>
      )}
    </Card>
  );
}
