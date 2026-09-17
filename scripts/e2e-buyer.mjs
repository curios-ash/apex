#!/usr/bin/env node
// Buyer desk smoke: /deals renders, mock geocoder suggests Maple Austin.
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

process.exit(failures === 0 ? 0 : 1);
