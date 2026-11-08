"use client";

import { useActionState } from "react";
import { requestSignIn, verifySignInCode, type SignInState } from "@/app/actions";
import { Button, inputClass } from "@/components/ui";

function EmailStep({ state, action, pending, mode, next }: { state: SignInState; action: (f: FormData) => void; pending: boolean; mode: "signin" | "signup"; next?: string }) {
  return (
    <form action={action} className="space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {mode === "signup" ? (
        <label className="block">
          <span className="mb-1.5 block text-sm text-fg-2">Your name</span>
          <input name="name" required autoComplete="name" className={inputClass} placeholder="Dana Reyes" defaultValue={state?.name} />
        </label>
      ) : null}
      <label className="block">
        <span className="mb-1.5 block text-sm text-fg-2">Email</span>
        <input name="email" type="email" required autoComplete="email" autoFocus className={inputClass} placeholder="you@company.com" defaultValue={state?.email} />
      </label>
      {mode === "signup" ? (
        <label className="block">
          <span className="mb-1.5 block text-sm text-fg-2">
            Company website <span className="text-subtle">(optional)</span>
          </span>
          <input name="website" type="text" inputMode="url" autoComplete="url" className={inputClass} placeholder="acme.com" defaultValue={state?.website} />
          <span className="mt-1.5 block text-xs text-muted">We&apos;ll read it during onboarding to capture your brand.</span>
        </label>
      ) : null}
      {state?.error ? <p role="alert" className="text-sm text-red">{state.error}</p> : null}
      <Button type="submit" disabled={pending} className="w-full py-3">
        {pending ? "Sending…" : mode === "signup" ? "Create my Studio" : "Continue with email"}
      </Button>
    </form>
  );
}

function GoogleButton({ next }: { next?: string }) {
  return (
    <>
      <a
        href={`/api/auth/google/start?next=${encodeURIComponent(next ?? "/studio")}`}
        className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-line-strong bg-white py-2.5 text-sm font-medium text-[#1f1f1f] transition-colors hover:bg-[#f2f2f2]"
      >
        <svg viewBox="0 0 48 48" className="size-4" aria-hidden>
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
          <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
        </svg>
        Continue with Google
      </a>
      <div className="flex items-center gap-3 text-xs text-subtle">
        <span className="h-px flex-1 bg-line" /> or use email <span className="h-px flex-1 bg-line" />
      </div>
    </>
  );
}

export function SignInForm({ next, mode = "signin", google = false, workos = false }: { next?: string; mode?: "signin" | "signup"; google?: boolean; workos?: boolean }) {
  const [sent, request, requesting] = useActionState<SignInState, FormData>(requestSignIn, null);
  const [verified, verify, verifying] = useActionState<SignInState, FormData>(verifySignInCode, null);
  const state = verified ?? sent;
  if (state?.step !== "code")
    return (
      <div className="space-y-4">
        {workos ? (
          <>
            {/* Plain <a> so the /sign-in route runs and sets its PKCE cookie. */}
            <a
              href={`/sign-in?next=${encodeURIComponent(next ?? "/studio")}${mode === "signup" ? "&mode=signup" : ""}`}
              className="flex w-full items-center justify-center rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-[#140a05] hover:bg-[#ff6f3a]"
            >
              {mode === "signup" ? "Create your account" : "Continue to sign in"}
            </a>
            <p className="text-center text-xs text-muted">Email, Google or your company&apos;s SSO.</p>
            <details className="group rounded-lg border border-line px-4 py-3 text-sm">
              <summary className="cursor-pointer list-none text-fg-2 group-open:mb-3">Or get a one-time code by email</summary>
              <EmailStep state={state} action={request} pending={requesting} mode={mode} next={next} />
            </details>
          </>
        ) : (
          <>
            {google ? <GoogleButton next={next} /> : null}
            <EmailStep state={state} action={request} pending={requesting} mode={mode} next={next} />
          </>
        )}
      </div>
    );
  const domain = state.email?.split("@")[1] ?? "";
  const webmail = /gmail|googlemail/.test(domain) ? ["Open Gmail", "https://mail.google.com/mail/u/0/#search/from%3Afounderdesk"] : /outlook|hotmail|live\./.test(domain) ? ["Open Outlook", "https://outlook.live.com/mail/"] : null;
  return (
    <div className="space-y-5">
      <div className="text-center">
        <p className="text-fg">Check your inbox</p>
        <p className="mt-1.5 text-sm text-muted">
          We sent a sign-in link and a 6-digit code to <span className="text-fg-2">{state.email}</span>. Both expire in 10 minutes.
        </p>
      </div>
      {sent?.devCode ? (
        <p className="rounded-lg border border-amber/30 bg-amber/10 px-3 py-2.5 text-center text-sm text-amber">
          Simulated email (AgentMail isn&apos;t connected): your code is <span className="font-mono tracking-[0.2em] text-fg">{sent.devCode}</span>
        </p>
      ) : null}
      {webmail ? (
        <a href={webmail[1]} target="_blank" rel="noreferrer" className="block rounded-lg border border-line-strong py-2.5 text-center text-sm text-fg hover:bg-white/5">
          {webmail[0]}
        </a>
      ) : null}
      <form action={verify} className="space-y-3">
        <input type="hidden" name="email" value={state.email} />
        {next ? <input type="hidden" name="next" value={next} /> : null}
        {sent?.name ? <input type="hidden" name="name" value={sent.name} /> : null}
        {sent?.website ? <input type="hidden" name="website" value={sent.website} /> : null}
        <label className="block">
          <span className="mb-1.5 block text-sm text-fg-2">On another device? Enter the code</span>
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
            className={`${inputClass} text-center font-mono text-xl tracking-[0.5em]`}
            placeholder="••••••"
          />
        </label>
        {verified?.error ? <p role="alert" className="text-sm text-red">{verified.error}</p> : null}
        <Button type="submit" disabled={verifying} className="w-full py-3">
          {verifying ? "Checking…" : mode === "signup" ? "Verify and continue" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
