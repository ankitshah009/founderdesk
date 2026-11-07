# FounderDesk

**Email your notes. Approve the exact article.**
A founder emails notes, a report and a few links. FounderDesk takes payment, researches the argument, writes it in the founder's voice, holds every number and scope to its source, asks the founder by email when only they can answer, publishes only the version they approved, then verifies the live page and checks it on a phone.

```
Founder ──▶ AgentMail ◀──▶ App backend + MCP ◀──▶ Neon (state & evidence)
   └──▶ Stripe Checkout ─ payment event ─▶ │ ──▶ Naïve editorial agents (researcher · writer · reviewer)
                                           │ ◀─▶ Monid research tools (search · page extraction)
                                           └──▶ Founder approval page ─▶ Live web issue ─▶ Mobile Run check ─▶ back to backend
```

## Run it

```bash
pnpm install
pnpm dev                    # http://localhost:3000 — no keys needed
pnpm test                   # 26 tests, parallel across all cores, real Postgres via PGlite
pnpm build
```

With no credentials every integration runs as a **labelled simulation** (never a silent fake). The operator desk at `/desk` has an inbound-email simulator prefilled with the demo brief. Delivering it walks the whole spec:

1. **A — intake.** Job created from the email (thesis, audience, links, boundaries, private names) plus a fixed-scope acknowledgement with a Checkout link.
2. **B — payment.** Idempotent fulfillment moves the paid order straight into research.
3. **C — research.** Attachment and links fetched; only passages that appear verbatim in a source are kept as evidence.
4. **D — write and review.** The reviewer catches *80% in the notes vs 60% in the pilot report* and *"all companies" vs 42 B2B SaaS companies*.
5. **E — clarification.** The founder is asked by email. An unrelated reply keeps the job waiting; a real answer resumes it.
6. **F — approval.** Approval is bound to the draft version, its SHA-256 content hash and the destination.
7. **G — publish.** The live page is fetched back and must carry the approved hash; the URL is emailed.
8. **H — phone check.** The published article is checked as it renders on a phone.

## Go live

Copy `.env.example` to `.env.local` and fill in what you have. Each integration switches from simulated to live independently; `/status` shows which is which.

| Integration | Needs | Setup |
|---|---|---|
| Neon | `DATABASE_URL` | `pnpm db:migrate` |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | webhook → `/api/webhooks/stripe` (`checkout.session.completed`, `checkout.session.async_payment_succeeded`) |
| AgentMail | `AGENTMAIL_API_KEY` | `pnpm setup:agentmail` creates the inbox + webhook, prints `AGENTMAIL_INBOX_ID` / `AGENTMAIL_WEBHOOK_SECRET` |
| Naïve | `NAIVE_API_KEY` | agents are created on first use (idempotent) and stored in `app_settings` |
| Monid | `MONID_API_KEY` | `pnpm setup:monid` runs discover → inspect; pick real endpoints, then `--try` them |
| Mobile Run | `MOBILERUN_API_KEY`, `MOBILERUN_DEVICE_ID` | — |
| X / LinkedIn | user token / token + author URN | optional announcement destinations |
| MCP | `MCP_API_KEY` | see `/desk/connect` (Claude Code, Muse via `mcp-remote`) |

Production also requires `APP_SECRET` (signs private links), `DESK_TOKEN` (operator desk) and `CRON_SECRET` (the per-minute `/api/cron/tick` backstop in `vercel.json`).

## How it stays correct

- **Neon is the record.** Nothing depends on an agent's conversation history: `jobs`, `sources`, `evidence`, `drafts`, `reviews`, `approvals`, `publications`, `provider_events`, `dispatches`, `outbound_messages`.
- **Safe retries.** The sequence is always: receive → verify → persist event + next task → start remote work → record its ID → handle the result.
  - Every dispatch has a stable request key, which is also the provider idempotency key. The key changes only when a remote run definitively failed.
  - Workers lease rows with `FOR UPDATE SKIP LOCKED`, so webhooks, cron and open pages can all drive work concurrently.
- **Stage changes are compare-and-set.** Concurrent workers can't double-advance a job, double-charge or double-email.
- **Structured results are validated.** Every agent result is checked against the zod schema it was given. An idle Naïve session only counts as finished with `stop_reason: end_turn` and a valid structured result. A completed Monid run only counts if it returned usable text. A Mobile Run task only counts if it succeeded and returned output.
- **Guardrails can only make the reviewer stricter.** Deterministic checks for figures, scope, private names and citations run on every review, live or simulated.
- **Bounded loops.** At most 2 automatic revision cycles. Writing in a founder's answer is a separate, free pass.
- **Publish gate.** Publishing requires all of: paid; current draft == reviewed draft; no unresolved blocking findings; approval matches the content hash and destination; not already published.
- **Social posts aren't idempotent.** A `publishing` row is written before posting. A retry that finds it without an external ID stops for a human instead of double-posting.

## Design

The visual language follows Profound's marketing site as curated on Mobbin, retrieved through the Mobbin MCP:
- **Shell and type:** black canvas, hairline borders, dashed column guides, Inter at weight 500 with tight tracking.
- **Section patterns:** the perspective-grid hero with a glowing orb, the orange announcement pill, `[01]` mono step labels, and the four-cell feature grid.

App screens use Mobbin patterns Profound doesn't have: a document-plus-details-rail review page with a pinned approve action (Aboard, Mercury) and a vertical order timeline (Hers, Fiverr). Brand, copy and product are FounderDesk's own.

## Honest limits

- **Simulated mode.** The local editorial engine is deterministic and template-shaped. It exists to exercise the workflow, not to write like an agent. Real prose comes from the Naïve agents.
- **Integrations not yet run against live accounts.** The live AgentMail, Naïve, Monid, Mobile Run, X and LinkedIn clients follow their published API docs but have not been exercised against live accounts in this repo. Stripe and AgentMail webhook verification *is* tested with real signatures.
- **AgentMail webhook payload.** Fields like `from` and `thread_id` are parsed defensively because the docs show them only partially. Confirm against a real delivery.
- **TikTok and app posting via Mobile Run.** These are designed but deliberately not built: TikTok needs a video step and an app audit, and Mobile Run posting needs a tested account first.
- **Founder-supplied URLs.** They go through an SSRF guard (private, loopback and link-local addresses are refused), but DNS rebinding is not mitigated.
