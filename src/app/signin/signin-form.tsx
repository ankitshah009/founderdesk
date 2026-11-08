"use client";

import { useActionState } from "react";
import { requestSignIn, verifySignInCode, type SignInState } from "@/app/actions";
import { Button, inputClass } from "@/components/ui";

function EmailStep({ state, action, pending }: { state: SignInState; action: (f: FormData) => void; pending: boolean }) {
  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <span className="mb-1.5 block text-sm text-fg-2">Email</span>
        <input name="email" type="email" required autoComplete="email" autoFocus className={inputClass} placeholder="you@company.com" defaultValue={state?.email} />
      </label>
      {state?.error ? <p role="alert" className="text-sm text-red">{state.error}</p> : null}
      <Button type="submit" disabled={pending} className="w-full py-3">
        {pending ? "Sending…" : "Continue with email"}
      </Button>
    </form>
  );
}

export function SignInForm() {
  const [sent, request, requesting] = useActionState<SignInState, FormData>(requestSignIn, null);
  const [verified, verify, verifying] = useActionState<SignInState, FormData>(verifySignInCode, null);
  const state = verified ?? sent;
  if (state?.step !== "code") return <EmailStep state={state} action={request} pending={requesting} />;
  const domain = state.email?.split("@")[1] ?? "";
  const webmail = /gmail|googlemail/.test(domain) ? ["Open Gmail", "https://mail.google.com/mail/u/0/#search/from%3Afounderdesk"] : /outlook|hotmail|live\./.test(domain) ? ["Open Outlook", "https://outlook.live.com/mail/"] : null;
  return (
    <div className="space-y-5">
      <div className="text-center">
        <p className="text-fg">Check your inbox</p>
        <p className="mt-1.5 text-sm text-muted">
          If <span className="text-fg-2">{state.email}</span> has orders with us, we sent a sign-in link and a 6-digit code. Both expire in 10 minutes.
        </p>
      </div>
      {webmail ? (
        <a href={webmail[1]} target="_blank" rel="noreferrer" className="block rounded-lg border border-line-strong py-2.5 text-center text-sm text-fg hover:bg-white/5">
          {webmail[0]}
        </a>
      ) : null}
      <form action={verify} className="space-y-3">
        <input type="hidden" name="email" value={state.email} />
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
          {verifying ? "Checking…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
