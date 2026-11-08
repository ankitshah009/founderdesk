import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { socialAccounts, type SocialAccount, type SocialProvider } from "@/lib/db/schema";
import { SOCIAL, type SocialCredentials } from "@/lib/destinations/social";
import { decryptSecret, encryptSecret } from "@/lib/studio/crypto";
import { PROVIDER_LABEL, refreshTokens, type Profile, type TokenSet } from "./oauth";

/** Founder-owned social accounts. Every query is scoped to the owner's email. */

const norm = (email: string) => email.trim().toLowerCase();

export async function listAccounts(ownerEmail: string): Promise<SocialAccount[]> {
  const db = await getDb();
  return db.select().from(socialAccounts).where(eq(socialAccounts.ownerEmail, norm(ownerEmail))).orderBy(asc(socialAccounts.provider));
}

export async function getAccount(ownerEmail: string, provider: SocialProvider): Promise<SocialAccount | null> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(socialAccounts)
    .where(and(eq(socialAccounts.ownerEmail, norm(ownerEmail)), eq(socialAccounts.provider, provider)))
    .limit(1);
  return row ?? null;
}

/** Store (or replace) the founder's account for a provider. Tokens are encrypted at rest. */
export async function upsertAccount(ownerEmail: string, provider: SocialProvider, profile: Profile, tokens: TokenSet | null, opts: { simulated?: boolean } = {}) {
  const db = await getDb();
  const values = {
    externalUserId: profile.externalUserId,
    handle: profile.handle,
    accessTokenEnc: tokens ? encryptSecret(tokens.accessToken) : null,
    refreshTokenEnc: tokens?.refreshToken ? encryptSecret(tokens.refreshToken) : null,
    expiresAt: tokens?.expiresAt ?? null,
    scopes: tokens?.scopes ?? null,
    simulated: Boolean(opts.simulated),
    status: "connected" as const,
    connectedAt: new Date(),
    updatedAt: new Date(),
  };
  const [row] = await db
    .insert(socialAccounts)
    .values({ ownerEmail: norm(ownerEmail), provider, ...values })
    .onConflictDoUpdate({ target: [socialAccounts.ownerEmail, socialAccounts.provider], set: values })
    .returning();
  return row!;
}

/** Demo mode for providers without client credentials: a labelled account that never posts. */
export function connectSimulated(ownerEmail: string, provider: SocialProvider) {
  const local = norm(ownerEmail).split("@")[0]!.replace(/[^a-z0-9_]/g, "").slice(0, 15) || "you";
  const handle = provider === "linkedin" ? `${local} · simulated` : `@${local} · simulated`;
  return upsertAccount(ownerEmail, provider, { externalUserId: `sim_${provider}_${local}`, handle }, null, { simulated: true });
}

export async function disconnectAccount(ownerEmail: string, provider: SocialProvider) {
  const db = await getDb();
  await db.delete(socialAccounts).where(and(eq(socialAccounts.ownerEmail, norm(ownerEmail)), eq(socialAccounts.provider, provider)));
}

export async function setAutoPost(ownerEmail: string, provider: SocialProvider, autoPost: boolean) {
  const db = await getDb();
  await db
    .update(socialAccounts)
    .set({ autoPost, updatedAt: new Date() })
    .where(and(eq(socialAccounts.ownerEmail, norm(ownerEmail)), eq(socialAccounts.provider, provider)));
}

/** X/LinkedIn: refresh when within a minute of expiry. Instagram long-lived tokens: refresh in their last week. */
function needsRefresh(a: SocialAccount, now = Date.now()) {
  if (!a.expiresAt) return false;
  const window = a.provider === "instagram" ? 7 * 86_400_000 : 60_000;
  return a.expiresAt.getTime() - now < window;
}

export class ReconnectError extends Error {}

/** Decrypt the founder's account, refreshing an expiring token first. */
export async function accountCredentials(a: SocialAccount): Promise<SocialCredentials> {
  const base = { provider: a.provider, source: "founder" as const, externalUserId: a.externalUserId, handle: a.handle, accountId: a.id };
  if (a.simulated) return { ...base, simulated: true, accessToken: null };
  let accessToken = decryptSecret(a.accessTokenEnc);
  const refreshToken = decryptSecret(a.refreshTokenEnc);
  if (needsRefresh(a)) {
    const expired = a.expiresAt!.getTime() <= Date.now();
    let fresh: TokenSet | null = null;
    try {
      fresh = await refreshTokens(a.provider, { accessToken, refreshToken });
    } catch (err) {
      if (expired) {
        await markExpired(a.id);
        throw new ReconnectError(`${PROVIDER_LABEL[a.provider]} token refresh failed — reconnect the account in Studio → Connections. (${(err as Error).message.slice(0, 120)})`);
      }
    }
    if (fresh) {
      const db = await getDb();
      await db
        .update(socialAccounts)
        .set({ accessTokenEnc: encryptSecret(fresh.accessToken), refreshTokenEnc: fresh.refreshToken ? encryptSecret(fresh.refreshToken) : a.refreshTokenEnc, expiresAt: fresh.expiresAt, updatedAt: new Date() })
        .where(eq(socialAccounts.id, a.id));
      accessToken = fresh.accessToken;
    } else if (expired) {
      await markExpired(a.id);
      throw new ReconnectError(`${PROVIDER_LABEL[a.provider]} access has expired — reconnect the account in Studio → Connections.`);
    }
  }
  if (!accessToken) throw new ReconnectError(`${PROVIDER_LABEL[a.provider]} token could not be read — reconnect the account.`);
  return { ...base, simulated: false, accessToken };
}

async function markExpired(id: string) {
  const db = await getDb();
  await db.update(socialAccounts).set({ status: "expired", updatedAt: new Date() }).where(eq(socialAccounts.id, id));
}

/**
 * Who a job's post goes out as: the founder's connected account → the
 * operator's env token → nobody. Instagram has no env token (its operator
 * fallback is the Mobile Run phone, handled by the publish step).
 */
export async function resolveCredentials(ownerEmail: string, provider: SocialProvider): Promise<SocialCredentials | null> {
  const account = await getAccount(ownerEmail, provider);
  if (account?.status === "connected") return accountCredentials(account);
  if (provider === "instagram") return null;
  return SOCIAL[provider].envCredentials();
}
