"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ArrowUp, Check, Flame, Mic, Paperclip, Shuffle, Square } from "lucide-react";
import { materialFromFile, readMaterialAction, startFromIdea, type ActionState, type IdeasState } from "@/app/actions";
import { Button, inputClass } from "@/components/ui";

/**
 * One composer, like the AI tools founders already use: paste a website,
 * notes, links — or record or attach a voice note. Clear arguments are
 * confirmed as-is; anything else gets suggestions grounded in their notes.
 */

const STARTERS = [
  { label: "Just my website", text: "acme.com" },
  { label: "A rough idea", text: "We keep seeing teams buy tools before fixing their process. I think that's backwards. acme.com" },
  { label: "My argument", text: "I want to argue that founders should do support themselves until $1M ARR. My audience is first-time B2B SaaS founders. We cut churn from 6% to 3% after our CEO took the support inbox." },
];

export function StartForm() {
  const [state, read, reading] = useActionState<IdeasState, FormData>(readMaterialAction, null);
  const [material, setMaterial] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  async function addFile(file: Blob, name: string) {
    setFileError(null);
    setBusy(file.type.startsWith("audio") ? "Transcribing your voice note…" : `Reading ${name}…`);
    const fd = new FormData();
    fd.append("file", file, name);
    const res = await materialFromFile(fd);
    setBusy(null);
    if (res.error) return setFileError(res.error);
    setMaterial((m) => (m.trim() ? `${m.trim()}\n\n${res.text}` : (res.text ?? "")));
  }

  async function toggleRecording() {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    setFileError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/mp4";
      const rec = new MediaRecorder(stream, { mimeType: type, audioBitsPerSecond: 32_000 });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const blob = new Blob(chunks, { type: type.split(";")[0] });
        void addFile(blob, type.includes("webm") ? "voice-note.webm" : "voice-note.m4a");
      };
      recorder.current = rec;
      setSeconds(0);
      setRecording(true);
      rec.start(1000);
    } catch {
      setFileError("Microphone access was blocked. Allow it in your browser, or attach an audio file.");
    }
  }

  const submitWith = (op: string) => {
    const f = formRef.current;
    if (!f) return;
    (f.elements.namedItem("op") as HTMLInputElement).value = op;
    f.requestSubmit();
  };

  const status = busy ?? (reading ? (state?.result ? "Finding new angles…" : "Reading your notes and website…") : null);

  return (
    <div className="space-y-6">
      <form ref={formRef} action={read}>
        <input type="hidden" name="op" defaultValue="read" />
        <div className="rounded-2xl border border-line bg-white/[0.02] focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/20">
          <label className="sr-only" htmlFor="material">
            Your website, notes or links
          </label>
          <textarea
            id="material"
            name="material"
            value={material}
            onChange={(e) => setMaterial(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitWith("read");
            }}
            rows={5}
            autoFocus
            placeholder={"Paste your website, your notes, links — anything.\nOr record a voice note and just talk it through."}
            className="composer-input block w-full resize-y rounded-t-2xl bg-transparent px-5 pt-4 pb-2 text-base leading-relaxed text-fg placeholder:text-subtle outline-none focus:outline-none focus-visible:outline-none"
          />
          <div className="flex items-center gap-1.5 px-3 pb-3">
            <input
              ref={fileRef}
              type="file"
              accept="audio/*,video/*,.pdf,.txt,.md"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void addFile(f, f.name);
                e.target.value = "";
              }}
            />
            <button type="button" onClick={() => fileRef.current?.click()} className="rounded-lg p-2 text-fg-2 hover:bg-white/[0.06] hover:text-fg" aria-label="Attach a voice note, PDF or text file" title="Attach audio, PDF or text">
              <Paperclip className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={toggleRecording}
              aria-label={recording ? "Stop recording" : "Record a voice note"}
              className={`flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm ${recording ? "bg-red/15 text-red" : "text-fg-2 hover:bg-white/[0.06] hover:text-fg"}`}
            >
              {recording ? <Square className="size-3.5 fill-current" aria-hidden /> : <Mic className="size-4" aria-hidden />}
              {recording ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} · stop` : "Talk it through"}
            </button>
            <span className="ml-auto hidden text-xs text-subtle sm:block">⌘ Enter</span>
            <button
              type="submit"
              disabled={!!status || recording || material.trim().length < 4}
              aria-label="Continue"
              className="ml-2 grid size-9 place-items-center rounded-full bg-accent text-[#140a05] disabled:opacity-40"
            >
              <ArrowUp className="size-4" aria-hidden />
            </button>
          </div>
        </div>
        {!state && !status && !material ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-subtle">Try:</span>
            {STARTERS.map((s) => (
              <button key={s.label} type="button" onClick={() => setMaterial(s.text)} className="rounded-full border border-line px-3 py-1 text-fg-2 hover:border-white/30 hover:text-fg">
                {s.label}
              </button>
            ))}
          </div>
        ) : null}
        {status ? (
          <p role="status" className="mt-3 flex items-center gap-2 text-sm text-muted">
            <span className="size-2 animate-pulse rounded-full bg-accent" aria-hidden /> {status}
          </p>
        ) : null}
        {(fileError ?? state?.error) && !status ? (
          <p role="alert" className="mt-3 rounded-lg border border-red/30 bg-red/10 px-3 py-2 text-sm text-red">
            {fileError ?? state?.error}
          </p>
        ) : null}
      </form>

      {state?.direct && !reading ? <Confirm material={state.material ?? material} direct={state.direct} onAlternatives={() => submitWith("ideas")} /> : null}
      {state?.result && !reading ? <Pick material={state.material ?? material} result={state.result} onShuffle={() => submitWith("shuffle")} onBolder={() => submitWith("bold")} /> : null}
    </div>
  );
}

function Finish({ material, pick, cta }: { material: string; pick?: string; cta: string }) {
  const [started, start, starting] = useActionState<ActionState, FormData>(startFromIdea, null);
  return (
    <form action={start} className="space-y-4">
      <input type="hidden" name="material" value={material} />
      {pick ? <input type="hidden" name="pick" value={pick} /> : null}
      <details className="group text-sm">
        <summary className="cursor-pointer list-none text-fg-2 group-open:mb-2">+ Add a story, a number, or something to keep private (optional)</summary>
        <div className="space-y-2">
          <textarea name="angle" rows={3} className={inputClass} placeholder="A number, a customer story, something you tried that didn't work…" />
          <input name="boundaries" className={inputClass} placeholder="e.g. Keep customer names private." />
        </div>
      </details>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input name="email" type="email" required autoComplete="email" className={`${inputClass} sm:flex-1`} placeholder="Your email — we send the draft here" />
        <input name="name" autoComplete="name" className={`${inputClass} sm:w-44`} placeholder="Name (optional)" />
      </div>
      {started?.error ? (
        <p role="alert" className="rounded-lg border border-red/30 bg-red/10 px-3 py-2 text-sm text-red">
          {started.error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={starting} className="px-6 py-3 text-base">
          {starting ? "Starting…" : cta}
        </Button>
        <span className="text-sm text-muted">Researched, cited, and nothing publishes without your OK.</span>
      </div>
    </form>
  );
}

function Confirm({ material, direct, onAlternatives }: { material: string; direct: NonNullable<NonNullable<IdeasState>["direct"]>; onAlternatives: () => void }) {
  return (
    <section aria-labelledby="confirm-h" className="space-y-5 border-t border-line pt-6">
      <div className="rounded-xl border border-accent/40 bg-accent-tint p-4">
        <p id="confirm-h" className="text-xs font-semibold tracking-[0.08em] text-accent uppercase">
          We&apos;ll argue
        </p>
        <p className="mt-1.5 text-[15px] leading-relaxed text-fg">{direct.thesis}</p>
        {direct.audience ? <p className="mt-1.5 text-xs text-muted">For {direct.audience}</p> : null}
      </div>
      <p className="text-sm text-fg-2">
        Your notes go in as written, so the article keeps your words and numbers.{" "}
        <button type="button" onClick={onAlternatives} className="font-semibold text-fg underline underline-offset-4">
          Show me other angles
        </button>
      </p>
      <Finish material={material} cta="Write this — first article free" />
    </section>
  );
}

function Pick({ material, result, onShuffle, onBolder }: { material: string; result: NonNullable<NonNullable<IdeasState>["result"]>; onShuffle: () => void; onBolder: () => void }) {
  const [picked, setPicked] = useState(0);
  const idea = result.ideas[picked] ?? result.ideas[0]!;
  const showCompany = result.company.name !== "Your company";
  return (
    <section aria-labelledby="pick-h" className="space-y-5 border-t border-line pt-6">
      {showCompany ? (
        <p className="text-sm text-muted">
          <span className="font-semibold text-fg">{result.company.name}</span> · {result.company.oneLiner}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="pick-h" className="text-sm font-medium text-fg">
          Pick what to argue
        </h2>
        <div className="flex gap-1.5 text-xs">
          <button type="button" onClick={onShuffle} className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-fg-2 hover:text-fg">
            <Shuffle className="size-3.5" aria-hidden /> Shuffle
          </button>
          <button type="button" onClick={onBolder} className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-fg-2 hover:text-fg">
            <Flame className="size-3.5" aria-hidden /> Bolder
          </button>
        </div>
      </div>
      <div className="space-y-2" role="radiogroup" aria-labelledby="pick-h">
        {result.ideas.map((it, i) => (
          <label key={it.title} className={`block cursor-pointer rounded-xl border px-4 py-3 transition-colors ${picked === i ? "border-accent bg-accent-tint" : "border-line hover:border-white/25"}`}>
            <input type="radio" name="idea" checked={picked === i} onChange={() => setPicked(i)} className="sr-only" />
            <span className="flex items-start justify-between gap-3">
              <span className="text-[15px] font-semibold text-fg">{it.title}</span>
              {picked === i ? <Check className="size-4 shrink-0 text-accent" aria-hidden /> : null}
            </span>
            {picked === i ? (
              <>
                <span className="mt-1.5 block text-sm leading-relaxed text-fg-2">{it.argument}</span>
                <span className="mt-2 block text-xs text-muted">
                  For {it.audience} · {it.why}
                </span>
              </>
            ) : (
              <span className="mt-0.5 block truncate text-xs text-muted">For {it.audience}</span>
            )}
          </label>
        ))}
      </div>
      <Finish material={material} pick={JSON.stringify({ company: result.company, idea })} cta="Write this — first article free" />
    </section>
  );
}
