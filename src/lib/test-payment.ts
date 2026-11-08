import { crc32 } from "node:zlib";

/**
 * One-click test payments for Stripe Checkout in test mode.
 *
 * Checkout is hosted on checkout.stripe.com, so no page on our origin can fill
 * it. A browser extension (or a bookmarklet run on that page) can. The script
 * refuses to run unless the URL carries a test-mode session id (cs_test_…),
 * so it can never touch a live payment page. Stripe's test card 4242… only
 * works in test mode anyway.
 */

export const TEST_CARD = {
  email: "you@example.com",
  card: "4242 4242 4242 4242",
  expiry: "12 / 34",
  cvc: "123",
  name: "Test Founder",
  country: "US",
  countryLabel: "United States",
  zip: "10001",
} as const;

export const TEST_CARD_ROWS: Array<{ field: string; value: string; copy: string }> = [
  { field: "Email", value: "any address, e.g. you@example.com (prefilled with your order email)", copy: TEST_CARD.email },
  { field: "Card number", value: "4242 4242 4242 4242", copy: "4242424242424242" },
  { field: "Expiry", value: "any future date, e.g. 12/34", copy: "1234" },
  { field: "CVC", value: "any 3 digits, e.g. 123", copy: TEST_CARD.cvc },
  { field: "Name", value: "anything", copy: TEST_CARD.name },
  { field: "Country / ZIP", value: "any, e.g. United States, 10001", copy: TEST_CARD.zip },
];

/** Fills Stripe's hosted Checkout form. Plain ES5 so it runs as a bookmarklet too. */
export const FILL_SCRIPT = `(function () {
  var T = ${JSON.stringify(TEST_CARD)};
  function isTest() { return /cs_test_/.test(location.href); }
  function q(s) { return document.querySelector(s); }
  function set(el, v) {
    if (!el || el.disabled || el.readOnly) return false;
    var proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
    return true;
  }
  function toast(msg) {
    var t = document.createElement("div");
    t.textContent = msg;
    t.setAttribute("role", "status");
    t.style.cssText = "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483647;background:#111;color:#fff;font:500 13px/1.4 -apple-system,system-ui,sans-serif;padding:10px 14px;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.35)";
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 3200);
  }
  function fillOnce() {
    var cardTab = q('[data-testid="card-accordion-item-button"]');
    if (cardTab && !q("#cardNumber")) cardTab.click();
    if (!q("#cardNumber")) return false;
    var email = q("#email");
    if (email && !email.value) set(email, T.email);
    set(q("#cardNumber"), T.card);
    set(q("#cardExpiry"), T.expiry);
    set(q("#cardCvc"), T.cvc);
    set(q("#billingName"), T.name);
    var country = q("#billingCountry");
    if (country && country.value !== T.country) set(country, T.country);
    setTimeout(function () { set(q("#billingPostalCode"), T.zip); }, 250);
    return true;
  }
  window.__founderdeskFillTestCard = function (opts) {
    if (!isTest()) {
      if (!(opts && opts.quiet)) alert("FounderDesk autofill only runs on Stripe test-mode Checkout pages (cs_test_ sessions).");
      return;
    }
    var tries = 0;
    (function attempt() {
      if (fillOnce()) return toast("Test card filled: 4242 4242 4242 4242. Press Pay.");
      if (++tries < 20) setTimeout(attempt, 300);
      else if (!(opts && opts.quiet)) toast("Couldn't find the card form on this page.");
    })();
  };
})();`;

/** Content script: auto-fill on load in test mode, plus a button and Alt+Shift+F to refill. */
const CONTENT_SCRIPT = `(function () {
  if (!/cs_test_/.test(location.href)) return;
  window.__founderdeskFillTestCard({ quiet: true });
  var b = document.createElement("button");
  b.type = "button";
  b.textContent = "Fill test card";
  b.title = "FounderDesk: fill Stripe's test card (Alt+Shift+F)";
  b.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;background:#ff6b3d;color:#140a05;border:0;border-radius:999px;font:600 13px/1 -apple-system,system-ui,sans-serif;padding:10px 14px;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.25)";
  b.onclick = function () { window.__founderdeskFillTestCard(); };
  document.documentElement.appendChild(b);
  document.addEventListener("keydown", function (e) {
    if (e.altKey && e.shiftKey && (e.key === "F" || e.key === "f" || e.code === "KeyF")) window.__founderdeskFillTestCard();
  });
})();`;

export const EXTENSION_FILES: Record<string, string> = {
  "manifest.json": JSON.stringify(
    {
      manifest_version: 3,
      name: "FounderDesk test checkout autofill",
      version: "1.0.0",
      description: "Fills Stripe's test card on Checkout pages in test mode (cs_test_ sessions only). Never runs on live payments.",
      content_scripts: [{ matches: ["https://checkout.stripe.com/*"], js: ["fill.js", "content.js"], run_at: "document_idle" }],
    },
    null,
    2,
  ),
  "fill.js": FILL_SCRIPT,
  "content.js": CONTENT_SCRIPT,
  "README.md": [
    "# FounderDesk test checkout autofill",
    "",
    "Fills Stripe's test card (4242 4242 4242 4242, 12/34, 123, United States 10001) on Stripe Checkout,",
    "only when the session is in test mode (the URL contains cs_test_). It never runs on live payment pages.",
    "",
    "Install (Chrome, Edge, Arc, Brave): open chrome://extensions, turn on Developer mode,",
    "click Load unpacked, and choose this folder.",
    "",
    "On a test Checkout page the card is filled automatically. Use the orange button or Alt+Shift+F to fill again.",
  ].join("\n"),
};

export function bookmarkletHref(): string {
  return `javascript:${encodeURIComponent(`${FILL_SCRIPT};window.__founderdeskFillTestCard();void 0`)}`;
}

/** A minimal ZIP (stored, no compression) — enough for a four-file extension. */
export function zipFiles(files: Record<string, string>, folder: string): Buffer {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text, "utf8");
    const path = Buffer.from(`${folder}/${name}`, "utf8");
    const crc = crc32(data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(0x0800, 6); // UTF-8 names
    head.writeUInt16LE(0, 8); // stored
    head.writeUInt32LE(0, 10); // time/date
    head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(data.length, 18);
    head.writeUInt32LE(data.length, 22);
    head.writeUInt16LE(path.length, 26);
    local.push(head, path, data);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0x0800, 8);
    dir.writeUInt16LE(0, 10);
    dir.writeUInt32LE(0, 12);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(data.length, 20);
    dir.writeUInt32LE(data.length, 24);
    dir.writeUInt16LE(path.length, 28);
    dir.writeUInt32LE(offset, 42);
    central.push(dir, path);
    offset += head.length + path.length + data.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralBuf, end]);
}
