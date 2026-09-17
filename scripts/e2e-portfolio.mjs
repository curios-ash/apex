#!/usr/bin/env node
// Portfolio map smoke: /portfolio renders, geo metrics copy, mock Places still works.
// Usage: running `npm run dev`, then `node scripts/e2e-portfolio.mjs`.
const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";

let failures = 0;
function check(label, condition, detail = "") {
  const mark = condition ? "PASS" : "FAIL";
  if (!condition) failures += 1;
  console.log(`${mark}  ${label}${detail ? ` — ${detail}` : ""}`);
}

const page = await fetch(`${baseUrl}/portfolio`);
const html = await page.text();
check("/portfolio renders the owner book", page.status === 200 && html.includes("Portfolio map"));
check("geo metrics section is present", html.includes("Geo metrics"));
check("buyer desk is not replaced", html.includes("Find a deal"));

const suggest = await fetch(`${baseUrl}/api/places/suggest?q=${encodeURIComponent("maple austin")}`);
const body = await suggest.json();
check("mock geocoder still used without GOOGLE_MAPS_API_KEY", body.ok && body.provider === "mock");
check(
  "Maple Austin remains a seed hit for bulk/search",
  Array.isArray(body.suggestions) && body.suggestions.some((s) => String(s.label).includes("421 Maple")),
);

process.exit(failures === 0 ? 0 : 1);
