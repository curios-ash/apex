#!/usr/bin/env node
// End-to-end check for slice 3 against a running dev server:
//   inbound PM statement (mock provider) -> verify decision -> reconciliation
//   -> transactions/actual_lines -> exceptions with dollar impacts, idempotent
//   across re-runs. Confirm + review generation are exercised in the browser
//   pass (server actions); this script asserts the deterministic pipeline.
// Usage: npm run dev (separate terminal), then `node scripts/e2e-reconcile.mjs`.
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

// 1. Server + seed.
const health = await fetch(`${baseUrl}/`).catch(() => null);
check("dev server responds", health?.ok === true);
if (!health?.ok) {
  console.error("Start the dev server first: npm run dev");
  process.exit(1);
}
const [workspace] = await sql`select id, slug from workspaces where slug = 'demo' limit 1`;
check("demo workspace seeded", !!workspace);
if (!workspace) {
  console.error("Run: npm run db:seed");
  process.exit(1);
}
const [property] =
  await sql`select id from properties where workspace_id = ${workspace.id} and name = '421 Maple Street' limit 1`;
const [agreement] =
  await sql`select fee_bps from pm_agreements where workspace_id = ${workspace.id} and property_id = ${property?.id} limit 1`;
const [budgetCount] =
  await sql`select count(*)::int as n from budget_lines where workspace_id = ${workspace.id} and property_id = ${property?.id}`;
check("property + 8% PM agreement + budgets seeded", !!property && agreement?.fee_bps === 800 && budgetCount.n >= 10);

async function ingestFixture(fixture, subject) {
  const content = Buffer.from(
    readFileSync(`fixtures/${fixture}`, "utf8") + `\nReference: e2e-${Date.now()}\n`,
  ).toString("base64");
  const payload = {
    From: "owner@example.com",
    To: "demo@in.apex.example.com",
    Subject: subject,
    TextBody: "Forwarding a statement.",
    MessageID: `<e2e-${Date.now()}-${fixture}@local>`,
    Attachments: [{ Name: fixture, ContentType: "text/plain", Content: content }],
  };
  const response = await fetch(`${baseUrl}/api/inbound-email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return response.json();
}

async function verifyLatestExtraction(documentId) {
  // Simulates the /verify decision; the browser pass exercises the real
  // server action (which also triggers reconciliation).
  await sql`
    update extractions set status = 'verified', verified_at = now()
    where document_id = ${documentId}
  `;
}

async function reconcile(month) {
  const response = await fetch(`${baseUrl}/api/reconcile`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(month ? { month } : {}),
  });
  return response.json();
}

// 2. March statement.
const march = await ingestFixture("pm-statement-2026-03-maple.txt", "Fwd: March owner statement");
const marchDoc = march.documents?.[0];
check("march statement extracted", marchDoc?.status === "extracted", marchDoc?.status);
await verifyLatestExtraction(marchDoc.documentId);
const marchRun = await reconcile("2026-03-01");
check("march reconciliation ran", marchRun.ok === true, JSON.stringify(marchRun.monthsReconciled));
// Re-ingesting the same statement with a new forwarding wrapper must not
// double-count lines — the cross-document dedupe skips them, so assert the
// total, not the per-run count.
const [marchTxCount] = await sql`
  select count(*)::int as n from transactions
  where workspace_id = ${workspace.id} and transaction_date >= '2026-03-01' and transaction_date <= '2026-03-31'
`;
check("march transactions materialized (9, deduped across re-ingests)", marchTxCount.n === 9, `${marchTxCount.n}`);

const marchExceptions = await sql`
  select rule_id, dollar_impact_cents, severity, status from exceptions
  where workspace_id = ${workspace.id} and month = '2026-03-01' order by rule_id
`;
const marchByRule = Object.fromEntries(marchExceptions.map((e) => [e.rule_id, e]));
check(
  "march: fee_drift $58.00",
  Number(marchByRule.fee_drift_v1?.dollar_impact_cents) === 5800,
  JSON.stringify(marchByRule.fee_drift_v1?.dollar_impact_cents),
);
check("march: duplicate_charge $95.00", Number(marchByRule.duplicate_charge_v1?.dollar_impact_cents) === 9500);
check(
  "march: repeat_repair $375.00 (3 repairs)",
  Number(marchByRule.repeat_repair_v1?.dollar_impact_cents) === 37500,
);
check("march: no vacancy exception (rent on plan)", !marchByRule.vacancy_vs_plan_v1);
check(
  "march: exceptions open or confirmed (browser pass may have confirmed one)",
  marchExceptions.every((e) => ["open", "confirmed"].includes(e.status)),
);

const marchActuals = await sql`
  select category, amount_cents from actual_lines
  where workspace_id = ${workspace.id} and month = '2026-03-01' order by category
`;
const marchActualByCategory = Object.fromEntries(marchActuals.map((a) => [a.category, a.amount_cents]));
check("march actuals: rent $2,900.00", Number(marchActualByCategory.rent) === 290000);
check(
  "march actuals: owner draw excluded from expenses",
  marchActualByCategory.other_expense === undefined,
  JSON.stringify(marchActualByCategory),
);

// 3. Idempotency: a second run changes nothing.
const rerun = await reconcile("2026-03-01");
const [marchExceptionCount] =
  await sql`select count(*)::int as n from exceptions where workspace_id = ${workspace.id} and month = '2026-03-01'`;
check(
  "re-run is idempotent (3 march exceptions, none auto-resolved)",
  marchExceptionCount.n === 3 && rerun.exceptionsAutoResolved === 0,
  `count=${marchExceptionCount.n} resolved=${rerun.exceptionsAutoResolved}`,
);

// 4. April statement brings history: vacancy, insurance jump, aging, more repairs.
const april = await ingestFixture("pm-statement-2026-04-maple.txt", "Fwd: April owner statement");
const aprilDoc = april.documents?.[0];
check("april statement extracted", aprilDoc?.status === "extracted", aprilDoc?.status);
await verifyLatestExtraction(aprilDoc.documentId);
await reconcile("2026-04-01");

const aprilExceptions = await sql`
  select rule_id, dollar_impact_cents from exceptions
  where workspace_id = ${workspace.id} and month = '2026-04-01' order by rule_id
`;
const aprilByRule = Object.fromEntries(aprilExceptions.map((e) => [e.rule_id, e]));
check("april: fee_drift $29.00", Number(aprilByRule.fee_drift_v1?.dollar_impact_cents) === 2900);
check(
  "april: repeat_repair $1,000.00 critical (6 repairs / 90d)",
  Number(aprilByRule.repeat_repair_v1?.dollar_impact_cents) === 100000,
);
check("april: insurance jump $145.00", Number(aprilByRule.insurance_tax_jump_v1?.dollar_impact_cents) === 14500);
check("april: vacancy $1,450.00", Number(aprilByRule.vacancy_vs_plan_v1?.dollar_impact_cents) === 145000);
check("april: work order WO-2001 aging $190.00", Number(aprilByRule.work_order_aging_v1?.dollar_impact_cents) === 19000);

// 5. Documents marked reconciled.
const [docs] =
  await sql`select count(*)::int as n from documents where workspace_id = ${workspace.id} and status = 'reconciled'`;
check("source documents marked reconciled", docs.n >= 2, `${docs.n}`);

// 6. Pages render the findings.
const exceptionsHtml = await (await fetch(`${baseUrl}/exceptions`)).text();
check(
  "/exceptions lists rules with dollar impacts",
  ["fee_drift_v1", "duplicate_charge_v1", "vacancy_vs_plan_v1", "work_order_aging_v1"].every((r) =>
    exceptionsHtml.includes(r),
  ) && exceptionsHtml.includes("$1,450.00"),
);
const ledgerHtml = await (await fetch(`${baseUrl}/ledger`)).text();
check(
  "/ledger renders (empty state or confirmed entries)",
  ledgerHtml.includes("Nothing confirmed yet") || ledgerHtml.includes("Total confirmed impact"),
);
const reviewHtml = await (await fetch(`${baseUrl}/review`)).text();
check("/review renders for the property", reviewHtml.includes("421 Maple Street"));

await sql.end();
console.log(failures === 0 ? "\ne2e OK" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
