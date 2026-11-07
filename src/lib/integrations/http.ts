export class ProviderError extends Error {
  constructor(
    readonly provider: string,
    readonly status: number,
    readonly body: string,
    message?: string,
  ) {
    super(message ?? `${provider} HTTP ${status}: ${body.slice(0, 300)}`);
    this.name = "ProviderError";
  }

  /** 4xx other than 408/409/429 will not succeed on retry. */
  get retryable(): boolean {
    return this.status >= 500 || this.status === 408 || this.status === 409 || this.status === 429 || this.status === 0;
  }
}

type RequestOpts = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  token?: string;
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
};

export async function requestJson<T>(provider: string, url: string, opts: RequestOpts = {}): Promise<{ status: number; data: T }> {
  const headers: Record<string, string> = { accept: "application/json", ...opts.headers };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
      cache: "no-store",
    });
  } catch (err) {
    throw new ProviderError(provider, 0, String(err), `${provider} request failed: ${String(err)}`);
  }
  const text = await res.text();
  if (!res.ok && res.status !== 202) throw new ProviderError(provider, res.status, text);
  let data: T;
  try {
    data = (text ? JSON.parse(text) : {}) as T;
  } catch {
    throw new ProviderError(provider, res.status, text, `${provider} returned non-JSON`);
  }
  return { status: res.status, data };
}
