"use client";

import { useActionState } from "react";
import { ArrowUpRight, Mail, Reply } from "lucide-react";
import { resendStartLink, type ActionState } from "@/app/actions";
import { Button, ButtonLink } from "@/components/ui";

/**
 * Free first article: one focused card. The founder proves the mailbox either
 * by clicking the emailed link or by replying to the email; this page
 * auto-refreshes and moves on by itself when either happens.
 */
export function StartFreeCard({ token, email, inbox, payUrl, price }: { token: string; email: string; inbox: string; payUrl: string | null; price: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(resendStartLink, null);
  const search = encodeURIComponent(`from:${inbox}`);
  return (
    <section aria-labelledby="start-h" className="mt-8 max-w-xl rounded-3xl border border-accent/30 bg-accent-tint p-6 md:p-7">
      <p className="text-xs font-semibold tracking-[0.08em] text-accent uppercase">Your first article is free</p>
      <h2 id="start-h" className="mt-2 text-xl font-semibold text-fg">
        Confirm it&apos;s you to start research
      </h2>
      <p className="mt-2 text-[15px] leading-relaxed text-fg-2">
        We emailed <span className="font-semibold text-fg">{email}</span>. Do either one — research starts within seconds and this page updates by itself:
      </p>
      <ul className="mt-4 space-y-2.5 text-sm text-fg">
        <li className="flex gap-2.5">
          <Mail className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
          Click the link in the email, then <span className="font-semibold">Start my free article</span>, or
        </li>
        <li className="flex gap-2.5">
          <Reply className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
          Just reply to it. Anything you add (a detail, a link, a voice memo) goes into the article.
        </li>
      </ul>
      <div className="mt-6 flex flex-wrap gap-2.5">
        <ButtonLink href={`https://mail.google.com/mail/u/0/#search/${search}`} target="_blank" rel="noopener noreferrer">
          Open Gmail <ArrowUpRight className="size-4" aria-hidden />
        </ButtonLink>
        <ButtonLink href="https://outlook.office.com/mail/" target="_blank" rel="noopener noreferrer" variant="secondary">
          Open Outlook <ArrowUpRight className="size-4" aria-hidden />
        </ButtonLink>
      </div>
      <form action={action} className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-fg-2">
        <input type="hidden" name="t" value={token} />
        <span>Not there? Check spam, or</span>
        <Button type="submit" variant="ghost" disabled={pending || !!state?.ok} className="px-0 py-0 font-semibold text-fg underline underline-offset-4">
          {pending ? "Sending…" : state?.ok ? "Sent" : "send it again"}
        </Button>
        {state?.ok || state?.error ? (
          <span role="status" className={`basis-full text-xs ${state.error ? "text-red" : "text-green"}`}>
            {state.error ?? state.ok}
          </span>
        ) : null}
      </form>
      {payUrl ? (
        <p className="mt-5 border-t border-accent/20 pt-4 text-xs text-muted">
          Rather not wait?{" "}
          <a href={payUrl} className="text-fg-2 underline underline-offset-4">
            Pay {price} and start now
          </a>
          .
        </p>
      ) : null}
    </section>
  );
}
