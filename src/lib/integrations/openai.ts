import { env } from "@/lib/env";
import { ProviderError } from "./http";

/** OpenAI's transcription endpoint accepts files up to 25 MB. */
export const MAX_TRANSCRIBE_BYTES = 25 * 1024 * 1024;

const EXT: Record<string, string> = {
  "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/m4a": "m4a", "audio/wav": "wav", "audio/x-wav": "wav",
  "audio/webm": "webm", "audio/ogg": "ogg", "audio/flac": "flac", "video/mp4": "mp4", "video/webm": "webm", "video/mpeg": "mpeg", "video/quicktime": "mp4",
};

export function isTranscribable(contentType: string, filename?: string | null): boolean {
  return /^(audio|video)\//.test(contentType) || /\.(mp3|m4a|wav|webm|ogg|flac|mp4|mpeg|mpga|mov)$/i.test(filename ?? "");
}

/** Transcribe an audio or video file to text with OpenAI. */
export async function transcribe(bytes: Uint8Array, contentType: string, filename?: string | null): Promise<string> {
  const key = env().OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  if (bytes.byteLength > MAX_TRANSCRIBE_BYTES) throw new Error(`File is ${(bytes.byteLength / 1048576).toFixed(0)} MB; transcription accepts up to 25 MB. Send a link instead.`);
  const name = filename && /\.\w+$/.test(filename) ? filename : `upload.${EXT[contentType] ?? "mp3"}`;
  const form = new FormData();
  form.append("file", new Blob([bytes as BlobPart], { type: contentType || "application/octet-stream" }), name);
  form.append("model", env().OPENAI_TRANSCRIBE_MODEL);
  form.append("response_format", "text");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { authorization: `Bearer ${key}` },
    body: form,
    signal: AbortSignal.timeout(180_000),
  });
  const text = await res.text();
  if (!res.ok) throw new ProviderError("openai", res.status, text);
  return text.trim();
}
