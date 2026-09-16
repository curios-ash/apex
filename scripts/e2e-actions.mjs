#!/usr/bin/env node
// End-to-end check for slice 5 (approval queue + renewal calendar + activity
// log) against a running server: obligations derive from the property record,
// the renewal-reminder cron drafts a 30-day reminder for the demo lease
// (pinned to today+20), idempotently across re-runs, and the new pages
// render. The interactive flow (confirm exception -> draft -> edit -> approve
// -> mailto) is exercised in the browser pass; this script asserts the
// deterministic pipeline.
// Usage: next start (separate terminal), then `node scripts/e2e-actions.mjs`.
// Set CRON_SECRET in the script env when the server runs with one.
import postgres from "postgres";

const baseUrl = process.env.BASE_URL ?? "http://localhost:4317";
const cronSecret = process.env.CRON_SECRET ?? null;
const sql = postgres(
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/apex",
);

let failures = 0;
function check(label, condition, detail = "") {
  const mark = condition ? "PASS" : "FAIL";
  if (!condition) failures += 1;
  console.log(`${mark}  ${label}${detail ? ` — ${detail}` : ""}`);
}

function daysFromNow(n) {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// 1. Server + seed.
const health = await fetch(`${baseUrl}/`).catch(() => null);
check("server responds", health?.ok === true);
if (!health?.ok) {
  console.error("Start the server first: npm run build && npm run start");
  process.exit(1);
}
const [workspace] = await sql`select id, slug from workspaces where slug = 'demo' limit 1`;
check("demo workspace seeded", !!workspace);
if (!workspace) {
  console.error("Run: npm run db:seed");
  process.exit(1);
}

// Pin the demo lease to today+20 so the assertions hold no matter when the
// seed ran, and clear prior reminder drafts for a deterministic cron count.
const leaseDue = daysFromNow(20);
const [lease] = await sql`
  update leases set end_date = ${leaseDue}, status = 'active', updated_at = now()
  where workspace_id = ${workspace.id} and tenant_name = 'Jordan Reyes'
  returning id
`;
check("demo lease pinned to today+20", !!lease, leaseDue);
await sql`
  delete from obligations
  where workspace_id = ${workspace.id} and obligation_type = 'lease_renewal' and related_id = ${lease.id}
`;
await sql`
  delete from actions
  where workspace_id = ${workspace.id} and action_type = 'reminder'
`;

// 2. Calendar page derives obligations from the property record.
const calendarHtml = await (await fetch(`${baseUrl}/calendar`)).text();
check("/calendar renders the lease", calendarHtml.includes("Jordan Reyes"));
check("/calendar shows the 20-day badge", calendarHtml.includes("in 20 days"));
check("/calendar shows the insurance renewal", calendarHtml.includes("Lone Star Mutual"));
check("/calendar shows the PM agreement", calendarHtml.includes("Sunset Property Management"));

const obligationRows = await sql`
  select obligation_type, due_date::text, notice_days, status from obligations
  where workspace_id = ${workspace.id} order by obligation_type
`;
const byType = Object.fromEntries(obligationRows.map((o) => [o.obligation_type, o]));
check(
  "obligations derived: lease + insurance + pm agreement",
  ["lease_renewal", "insurance_renewal", "pm_agreement_renewal"].every((t) => byType[t]),
  JSON.stringify(obligationRows.map((o) => o.obligation_type)),
);
check(
  "lease obligation due date matches the lease",
  byType.lease_renewal?.due_date === leaseDue,
  byType.lease_renewal?.due_date,
);
check(
  "notice windows: lease 60 / insurance 30 / pm 60",
  byType.lease_renewal?.notice_days === 60 &&
    byType.insurance_renewal?.notice_days === 30 &&
    byType.pm_agreement_renewal?.notice_days === 60,
);

// 3. Cron endpoint: auth, drafting, idempotency.
async function runCron(withAuth) {
  const headers = withAuth && cronSecret ? { authorization: `Bearer ${cronSecret}` } : {};
  const response = await fetch(`${baseUrl}/api/cron/renewal-reminders`, { headers });
  return { status: response.status, body: await response.json().catch(() => null) };
}

if (cronSecret) {
  const denied = await runCron(false);
  check("cron rejects a missing bearer token", denied.status === 401, `${denied.status}`);
}
const first = await runCron(true);
check("cron runs", first.status === 200 && first.body?.ok === true, JSON.stringify(first.body));
const demoResult = first.body?.results?.find((r) => r.workspace === "demo");
check("cron drafted exactly one reminder", demoResult?.remindersDrafted === 1, JSON.stringify(demoResult));

const reminderRows = await sql`
  select id, title, status, created_by, draft_payload from actions
  where workspace_id = ${workspace.id} and action_type = 'reminder'
`;
check("one reminder action in the queue", reminderRows.length === 1, `${reminderRows.length}`);
const reminder = reminderRows[0];
const payload = reminder?.draft_payload ?? {};
check(
  "reminder is pending_approval, agent-created, 30-day threshold",
  reminder?.status === "pending_approval" &&
    reminder?.created_by === "agent" &&
    payload.thresholdDays === 30 &&
    payload.obligationId != null,
  `${reminder?.status} ${reminder?.created_by} threshold=${payload.thresholdDays}`,
);
check(
  "reminder draft cites the lease and the countdown",
  typeof payload.body === "string" &&
    payload.body.includes("Jordan Reyes") &&
    payload.body.includes("Due in 20 days"),
);
check(
  "reminder is owner-facing (no mailto fields)",
  payload.to === null && payload.subject === null,
);

const second = await runCron(true);
const secondDemo = second.body?.results?.find((r) => r.workspace === "demo");
check(
  "cron re-run is idempotent (0 new reminders)",
  second.status === 200 && secondDemo?.remindersDrafted === 0,
  JSON.stringify(secondDemo),
);
const [reminderCount] = await sql`
  select count(*)::int as n from actions
  where workspace_id = ${workspace.id} and action_type = 'reminder'
`;
check("still exactly one reminder action", reminderCount.n === 1, `${reminderCount.n}`);

// 4. The queue and the activity log render the draft.
const actionsHtml = await (await fetch(`${baseUrl}/actions`)).text();
check("/actions lists the reminder", actionsHtml.includes("Lease renewal due in 20 days"));
check(
  "/actions states nothing is sent automatically",
  actionsHtml.includes("Nothing is ever sent automatically"),
);
const activityHtml = await (await fetch(`${baseUrl}/activity`)).text();
check("/activity shows action.drafted", activityHtml.includes("action.drafted"));
check("/activity shows obligations.synced", activityHtml.includes("obligations.synced"));
// Filter dropdowns list every action name, so assert filtering with a
// negative case: action.drafted never targets obligations, and a positive
// case on the target filter.
const emptyFiltered = await (
  await fetch(`${baseUrl}/activity?action=action.drafted&target=obligation`)
).text();
check(
  "/activity filters compose (action.drafted x obligation -> empty)",
  emptyFiltered.includes("No audit rows match"),
);
const targetFiltered = await (await fetch(`${baseUrl}/activity?target=action`)).text();
check("/activity filters by entity type", targetFiltered.includes("action.drafted"));

// 5. LLM call logging for the draft.
const [draftCall] = await sql`
  select count(*)::int as n from llm_calls
  where workspace_id = ${workspace.id} and purpose = 'draft' and prompt_version = 'coordinator-draft-v1'
`;
check("drafting is logged to llm_calls (purpose=draft)", draftCall.n >= 1, `${draftCall.n}`);

await sql.end();
console.log(failures === 0 ? "\ne2e OK" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
