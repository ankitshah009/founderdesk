import { EXTENSION_FILES, zipFiles } from "@/lib/test-payment";

/** Download the test-checkout autofill extension, ready for "Load unpacked". */
export function GET() {
  const zip = zipFiles(EXTENSION_FILES, "founderdesk-test-autofill");
  return new Response(new Uint8Array(zip), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": 'attachment; filename="founderdesk-test-autofill.zip"',
      "cache-control": "public, max-age=3600",
    },
  });
}
