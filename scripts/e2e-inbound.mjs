#!/usr/bin/env node
// End-to-end check for slice 2 against a running dev server:
//   simulated inbound email -> document stored -> classified -> extraction row
//   -> visible in /verify.
// Usage: npm run dev (separate terminal), then `node scripts/e2e-inbound.mjs`.
import { readFileSync } from "node:fs";
import postgres from "postgres";

const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
const sql = postgres(
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/apex",
);

let failures = 0;
function check(label, condition, detail = "") {
  const mark = condition ? "PASS" : "FAIL";
  if (!condition) failures += 1;
  console.log(`${mark}  ${label}${detail ? ` — ${detail}` : ""}`);
}

// 1. Server is up.
const health = await fetch(`${baseUrl}/`).catch(() => null);
check("dev server responds", health?.ok === true);
if (!health?.ok) {
  console.error("Start the dev server first: npm run dev");
  process.exit(1);
}

// 2. Workspace exists (seed is idempotent).
const [workspace] = await sql`select id, slug from workspaces where slug = 'demo' limit 1`;
check("demo workspace seeded", !!workspace);
if (!workspace) {
  console.error("Run: npm run db:seed");
  process.exit(1);
}

// 3. Simulate the inbound email with a unique attachment (dedupe-safe).
const fixture = readFileSync("fixtures/pm-statement-appfolio.txt", "utf8");
const unique = `\nReference: e2e-${Date.now()}\n`;
const content = Buffer.from(fixture + unique).toString("base64");
const payload = {
  From: "owner@example.com",
  To: "demo@in.apex.example.com",
  Subject: "Fwd: March owner statement",
  TextBody: "Forwarding the March owner statement.",
  MessageID: `<e2e-${Date.now()}@local>`,
  Attachments: [
    { Name: "pm-statement-appfolio.txt", ContentType: "text/plain", Content: content },
  ],
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
const result = await response.json();
check("webhook accepted", response.status === 200 && result.ok === true, JSON.stringify(result.failures ?? []));
const doc = result.documents?.[0];
check("document stored + processed", !!doc && doc.status === "extracted", doc?.status);
check("classified as pm_statement", doc?.documentType === "pm_statement", doc?.documentType);

// 4. Extraction row landed in the verify queue.
const [extraction] = doc
  ? await sql`
      select status, schema_version, confidence from extractions
      where document_id = ${doc.documentId} order by created_at desc limit 1
    `
  : [];
check("extraction row exists", !!extraction, extraction?.schema_version);
check(
  "extraction needs review",
  extraction?.status === "needs_review",
  `status=${extraction?.status} confidence=${extraction?.confidence}`,
);

// 5. LLM calls were logged.
const [callCount] = doc
  ? await sql`
      select count(*)::int as n from llm_calls where document_id = ${doc.documentId}
    `
  : [{ n: 0 }];
check("llm_calls logged (classify + extract)", callCount.n >= 2, `${callCount.n} rows`);

// 6. The /verify page shows it.
const verifyHtml = await (await fetch(`${baseUrl}/verify`)).text();
check(
  "/verify lists the document",
  verifyHtml.includes("pm-statement-appfolio.txt"),
);

await sql.end();
console.log(failures === 0 ? "\ne2e OK" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
