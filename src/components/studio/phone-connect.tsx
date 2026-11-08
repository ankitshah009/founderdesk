"use client";

import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";
import { pollPhoneCheck, startPhoneCheck, type PhoneCheckState } from "@/app/studio/connections/actions";

/**
 * Link the account signed in to the app on the Mobile Run phone. The check is
 * read-only: the phone opens the app, reads the handle and reports back.
 */
export function PhoneConnect({ provider, label, deviceUrl }: { provider: string; label: string; deviceUrl: string }) {
  const [state, setState] = useState<PhoneCheckState>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!state.running || !state.token) return;
    const t = setTimeout(async () => setState(await pollPhoneCheck(state.token!)), 5000);
    return () => clearTimeout(t);
  }, [state]);

  async function check() {
    setBusy(true);
    setState(await startPhoneCheck(provider));
    setBusy(false);
  }

  return (
    <div className="rounded-lg border border-line p-3 text-xs">
      <p className="flex items-center gap-1.5 font-medium text-fg">
        <Smartphone className="size-3.5" aria-hidden /> Post from your Mobile Run phone
      </p>
      <ol className="mt-2 list-decimal space-y-1 pl-4 text-fg-2">
        <li>
          Open your{" "}
          <a href={deviceUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
            Mobile Run device
          </a>{" "}
          and sign in to the {label} app.
        </li>
        <li>Check it here. The phone only reads which account is signed in.</li>
      </ol>
      <button
        type="button"
        onClick={check}
        disabled={busy || state.running}
        className="mt-3 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-black hover:bg-white/90 disabled:opacity-50"
      >
        {state.running ? "Checking the phone…" : state.handle ? "Check again" : "Check phone"}
      </button>
      {state.running ? <p className="mt-2 text-muted">The phone is opening {label}. This takes about a minute.</p> : null}
      {state.handle ? <p className="mt-2 text-green">Connected as {state.handle}. Approved posts will go out from the phone.</p> : null}
      {state.error ? (
        <p role="alert" className="mt-2 text-red">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
