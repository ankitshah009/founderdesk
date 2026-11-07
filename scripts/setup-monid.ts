/**
 * Choose real Monid endpoints for the two research operations. Follows the
 * documented sequence — discover → inspect — and prints candidates with their
 * input schema so you can pick, then test, the ones your account offers.
 *
 *   pnpm setup:monid
 *   pnpm setup:monid -- --try search --provider exa --endpoint /search --query "narrow AI support workflows"
 *   pnpm setup:monid -- --try fetch  --provider firecrawl --endpoint /scrape --url https://example.com
 */
import { parseArgs } from "node:util";
import { env } from "../src/lib/env";
import { discover, fillTemplate, getRun, inspect, normalizeDocs, extractText, run, TERMINAL } from "../src/lib/integrations/monid";

const { values } = parseArgs({
  options: {
    try: { type: "string" },
    provider: { type: "string" },
    endpoint: { type: "string" },
    query: { type: "string", default: "narrow AI customer support workflows for SaaS startups" },
    url: { type: "string", default: "https://en.wikipedia.org/wiki/Customer_support" },
  },
});

async function show(label: string, query: string) {
  console.log(`\n── ${label}: "${query}"`);
  const results = await discover(query, 6);
  for (const r of results) {
    console.log(`\n  ${r.provider}${r.endpoint}  (score ${r.score.toFixed(2)})`);
    console.log(`    ${r.description.slice(0, 140)}`);
    try {
      const detail = await inspect(r.provider, r.endpoint);
      const schema = (detail.inputSchema ?? detail.input_schema ?? detail.schema) as unknown;
      if (schema) console.log(`    input: ${JSON.stringify(schema).slice(0, 300)}`);
    } catch (err) {
      console.log(`    (inspect failed: ${(err as Error).message.slice(0, 80)})`);
    }
  }
}

async function trial() {
  const e = env();
  const kind = values.try!;
  const template = kind === "search" ? e.MONID_SEARCH_INPUT : e.MONID_FETCH_INPUT;
  const input = fillTemplate(template, { query: values.query!, url: values.url! });
  console.log(`Running ${values.provider}${values.endpoint} with ${JSON.stringify(input)}`);
  let r = await run(values.provider!, values.endpoint!, input);
  while (!TERMINAL.has(r.status)) {
    await new Promise((res) => setTimeout(res, 3000));
    r = await getRun(r.runId);
    process.stdout.write(".");
  }
  console.log(`\nstatus ${r.status} · provider HTTP ${r.providerResponse?.httpStatus ?? "?"}`);
  // A completed run is not evidence by itself — show what we would actually keep.
  if (kind === "search") {
    const docs = normalizeDocs(r.output, 8);
    console.log(`${docs.length} documents with URLs:`);
    for (const d of docs) console.log(`  - ${d.title ?? "(untitled)"} · ${d.url} · ${d.content ? `${d.content.length} chars` : "no body"}`);
  } else {
    const text = extractText(r.output);
    console.log(text ? `${text.length} chars of text:\n${text.slice(0, 400)}…` : "No usable text in the output.");
  }
}

async function main() {
  if (!env().MONID_API_KEY) throw new Error("Set MONID_API_KEY first.");
  if (values.try) return trial();
  await show("Search candidates", "web search returning result URLs, titles and text");
  await show("Extraction candidates", "fetch a web page and extract its main text content");
  console.log("\nPick one of each, set MONID_SEARCH_PROVIDER/ENDPOINT/INPUT and MONID_FETCH_PROVIDER/ENDPOINT/INPUT, then verify with --try.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
