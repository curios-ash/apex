#!/usr/bin/env node
// Buyer desk smoke: /deals renders, mock geocoder suggests Maple Austin, Open deal POST creates a deal.
// Usage: running `npm run dev`, then `node scripts/e2e-buyer.mjs`.
const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";

let failures = 0;
function check(label, condition, detail = "") {
  const mark = condition ? "PASS" : "FAIL";
  if (!condition) failures += 1;
  console.log(`${mark}  ${label}${detail ? ` — ${detail}` : ""}`);
}

const deals = await fetch(`${baseUrl}/deals`);
const dealsHtml = await deals.text();
check("/deals renders the buyer search", deals.status === 200 && dealsHtml.includes("Look up the listing"));

const suggest = await fetch(`${baseUrl}/api/places/suggest?q=${encodeURIComponent("maple austin")}`);
const body = await suggest.json();
check("mock geocoder is used without GOOGLE_MAPS_API_KEY", body.ok && body.provider === "mock");
check(
  "Maple Austin is a seed hit",
  Array.isArray(body.suggestions) &&
    body.suggestions.some((s) => String(s.label).includes("421 Maple")),
);
check(
  "free-text create is offered",
  body.suggestions.some((s) => s.matched === false),
);

const maple = body.suggestions.find((s) => String(s.placeId).includes("maple-austin"));
const opened = await fetch(`${baseUrl}/api/deals/open`, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    query: "Maple Austin",
    placeId: maple?.placeId ?? "mock-421-maple-austin",
  }),
  redirect: "manual",
});
const openedLocation = opened.headers.get("location") ?? "";
let openedPath = "";
try {
  openedPath = new URL(openedLocation, baseUrl).pathname;
} catch {
  openedPath = openedLocation;
}
check(
  "Open deal POST redirects to a deal file",
  opened.status === 303 && /\/deals\/[0-9a-f-]{36}$/i.test(openedPath),
  openedPath || `status ${opened.status}`,
);

const empty = await fetch(`${baseUrl}/api/deals/open`, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ query: "", placeId: "" }),
  redirect: "manual",
});
const emptyLocation = empty.headers.get("location") ?? "";
let emptyError = "";
try {
  emptyError = new URL(emptyLocation, baseUrl).searchParams.get("error") ?? "";
} catch {
  emptyError = "";
}
check("empty Open deal redirects with an error", empty.status === 303 && emptyError === "empty-search");

process.exit(failures === 0 ? 0 : 1);
