#!/usr/bin/env node
// Posts a sample Postmark-style inbound email with an attachment to the local
// dev server. Usage:
//   node scripts/dev-inbound-email.mjs [--fixture fixtures/pm-statement-appfolio.txt]
//                                      [--slug demo] [--url http://localhost:3000]
import { readFileSync } from "node:fs";
import path from "node:path";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const fixture = arg("fixture", "fixtures/pm-statement-appfolio.txt");
const slug = arg("slug", "demo");
const toOverride = arg("to", "");
const baseUrl = arg("url", process.env.BASE_URL ?? "http://localhost:3000");
const domain = process.env.INBOUND_EMAIL_DOMAIN ?? "in.apex.example.com";

const filename = path.basename(fixture);
const content = readFileSync(fixture).toString("base64");

const payload = {
  From: "owner@example.com",
  To: toOverride || `${slug}@${domain}`,
  Subject: `Fwd: March owner statement (${filename})`,
  TextBody: "Forwarding the March owner statement from my PM.",
  MessageID: `<dev-${Date.now()}@local>`,
  Attachments: [{ Name: filename, ContentType: "text/plain", Content: content }],
};

const url = new URL(`${baseUrl}/api/inbound-email`);
if (process.env.INBOUND_EMAIL_SECRET) {
  url.searchParams.set("secret", process.env.INBOUND_EMAIL_SECRET);
}

const response = await fetch(url, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(payload),
});
const json = await response.json();
console.log(`POST ${url} -> ${response.status}`);
console.log(JSON.stringify(json, null, 2));
process.exit(response.ok && json.ok ? 0 : 1);
