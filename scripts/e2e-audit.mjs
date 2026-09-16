#!/usr/bin/env node
// End-to-end check for the free PM Statement Audit (/api/audit) against a
// running server: synthetic AppFolio-style statement as text upload, as a
// real PDF (locally generated), and as pasted text — asserting the exact
// flagged dollar total, that anonymous uploads leave no persisted rows, and
// that the IP rate limit engages.
// Usage: npm run start (separate terminal), then `node scripts/e2e-audit.mjs`.
import { readFileSync } from "node:fs";
import postgres from "postgres";

import { buildTinyPdf } from "./lib/tiny-pdf.mjs";

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

const fixture = readFileSync("fixtures/pm-statement-audit.txt", "utf8");
// Expected: fee drift $190.50 (10% charged vs 8% agreement on $8,775),
// duplicate $185.00, unexplained $45.00, WO-3001 aging $190.00.
const EXPECTED_TOTAL_CENTS = 61_050;

async function runAudit({ fileBytes, fileName, fileType, text }) {
  const form = new FormData();
  form.set("feePercent", "8");
  if (fileBytes) {
    form.set("file", new Blob([fileBytes], { type: fileType }), fileName);
  } else {
    form.set("text", text);
  }
  const response = await fetch(`${baseUrl}/api/audit`, { method: "POST", body: form });
  return { status: response.status, body: await response.json() };
}

function assertAuditResult(label, { status, body }) {
  check(`${label}: 200 ok`, status === 200 && body.ok === true, `status=${status}`);
  const byRule = new Map((body.flags ?? []).map((f) => [f.ruleId, f]));
  check(
    `${label}: four rule types flagged`,
    ["fee_drift", "duplicate_charge", "unexplained_fee", "work_order_aging"].every((r) =>
      byRule.has(r),
    ),
    [...byRule.keys()].join(","),
  );
  check(
    `${label}: fee drift $190.50`,
    byRule.get("fee_drift")?.dollarImpactCents === 19_050,
    `${byRule.get("fee_drift")?.dollarImpactCents}`,
  );
  check(
    `${label}: total $610.50`,
    body.totalFlaggedCents === EXPECTED_TOTAL_CENTS,
    `${body.totalFlaggedCents}`,
  );
  check(
    `${label}: statement metadata extracted`,
    body.statement?.pmCompanyName === "Sunset Property Management" &&
      body.statement?.periodStart === "2026-03-01" &&
      body.statement?.lineCount === 16,
    JSON.stringify({ pm: body.statement?.pmCompanyName, lines: body.statement?.lineCount }),
  );
}

// 1. Server reachable.
const health = await fetch(`${baseUrl}/`).catch(() => null);
check("server responds", health?.ok === true);
if (!health?.ok) {
  console.error("Start the server first: npm run start");
  process.exit(1);
}

// 2. Baseline row counts — the anonymous audit must not persist anything.
const tables = ["documents", "extractions", "llm_calls"];
async function counts() {
  const out = {};
  for (const t of tables) {
    const [row] = await sql`select count(*)::int as n from ${sql(t)}`;
    out[t] = row.n;
  }
  return out;
}
const before = await counts();

// 3. Text upload.
assertAuditResult("txt upload", await runAudit({
  fileBytes: Buffer.from(fixture, "utf8"),
  fileName: "pm-statement-audit.txt",
  fileType: "text/plain",
}));

// 4. Real PDF upload (generated locally, extracted via pdf.js).
const pdf = buildTinyPdf(fixture.split("\n"));
assertAuditResult("pdf upload", await runAudit({
  fileBytes: pdf,
  fileName: "pm-statement-audit.pdf",
  fileType: "application/pdf",
}));

// 5. Pasted text.
assertAuditResult("pasted text", await runAudit({ text: fixture }));

// 6. Validation errors.
const badFeeForm = new FormData();
badFeeForm.set("feePercent", "abc");
badFeeForm.set("text", fixture);
const badFeeRes = await fetch(`${baseUrl}/api/audit`, { method: "POST", body: badFeeForm });
check("rejects a non-numeric fee", badFeeRes.status === 400, `${badFeeRes.status}`);

const emptyForm = new FormData();
emptyForm.set("feePercent", "8");
const emptyRes = await fetch(`${baseUrl}/api/audit`, { method: "POST", body: emptyForm });
check("rejects missing statement", emptyRes.status === 400, `${emptyRes.status}`);

// 7. No persisted rows from any of the above.
const after = await counts();
check(
  "anonymous audits persist nothing (documents/extractions/llm_calls unchanged)",
  tables.every((t) => before[t] === after[t]),
  JSON.stringify({ before, after }),
);

// 8. Rate limit: 10/hour per IP. We've used 5; burn the rest and expect 429.
let lastStatus = 0;
for (let i = 0; i < 6; i++) {
  const res = await runAudit({ text: fixture });
  lastStatus = res.status;
}
check("rate limit engages at 10/hour", lastStatus === 429, `last=${lastStatus}`);

// 9. Pages render.
const auditHtml = await (await fetch(`${baseUrl}/audit`)).text();
check(
  "/audit page renders the tool and the privacy promise",
  auditHtml.includes("Audit your property manager") &&
    auditHtml.includes("never stored") &&
    auditHtml.includes("Management fee"),
);
const landingHtml = await (await fetch(`${baseUrl}/`)).text();
check(
  "landing page links the free audit tool",
  landingHtml.includes("/audit") && landingHtml.includes("Audit your last PM statement"),
);

await sql.end();
console.log(failures === 0 ? "\ne2e OK" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
