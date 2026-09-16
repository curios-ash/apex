#!/usr/bin/env node
// Idempotent demo seed: workspace (slug "demo"), an owner user, and one
// sample property. Safe to run repeatedly. Override with DATABASE_URL.
import postgres from "postgres";

const sql = postgres(
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/apex",
);

const [workspace] = await sql`
  insert into workspaces (name, slug)
  values ('Demo Workspace', 'demo')
  on conflict (slug) do update set name = excluded.name
  returning id, slug
`;

await sql`
  insert into users (workspace_id, email, full_name, role)
  values (${workspace.id}, 'owner@demo.apex.local', 'Demo Owner', 'owner')
  on conflict (email) do nothing
`;

let [property] = await sql`
  select id from properties
  where workspace_id = ${workspace.id} and name = '421 Maple Street'
  limit 1
`;
if (!property) {
  [property] = await sql`
    insert into properties (workspace_id, name, address_line1, city, state, zip, property_type)
    values (${workspace.id}, '421 Maple Street', '421 Maple Street', 'Austin', 'TX', '78701', 'duplex')
    returning id
  `;
}

// PM agreement at 8% of collected income — the demo statements charge 10%,
// which is what the fee-drift rule catches. The end date (75 days out) feeds
// the renewal calendar's pm_agreement_renewal obligation.
const [agreement] = await sql`
  select id from pm_agreements
  where workspace_id = ${workspace.id} and property_id = ${property.id}
  limit 1
`;
if (!agreement) {
  await sql`
    insert into pm_agreements (workspace_id, property_id, pm_company_name, fee_bps, start_date, end_date)
    values (${workspace.id}, ${property.id}, 'Sunset Property Management', 800, '2026-01-01', ${daysFromNow(75)})
  `;
} else {
  await sql`
    update pm_agreements set end_date = ${daysFromNow(75)}
    where id = ${agreement.id} and end_date is null
  `;
}

// --- Renewal calendar demo data (slice 5) ---------------------------------
// Dates are relative to seed time so the calendar always has live content:
// a lease ending in 20 days (inside the 30-day reminder window), a policy
// renewing in 45, and the PM agreement ending in 75 (above).

function daysFromNow(n) {
  const d = new Date(Date.now() + n * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

let [unitA] = await sql`
  select id from units
  where workspace_id = ${workspace.id} and property_id = ${property.id} and label = 'Unit A'
  limit 1
`;
if (!unitA) {
  [unitA] = await sql`
    insert into units (workspace_id, property_id, label, bedrooms, bathrooms, market_rent_cents, status)
    values (${workspace.id}, ${property.id}, 'Unit A', 2, 1, 1450_00, 'occupied')
    returning id
  `;
}
const [unitB] = await sql`
  select id from units
  where workspace_id = ${workspace.id} and property_id = ${property.id} and label = 'Unit B'
  limit 1
`;
if (!unitB) {
  await sql`
    insert into units (workspace_id, property_id, label, bedrooms, bathrooms, market_rent_cents, status)
    values (${workspace.id}, ${property.id}, 'Unit B', 2, 1, 1450_00, 'occupied')
  `;
}

const [existingLease] = await sql`
  select id from leases
  where workspace_id = ${workspace.id} and unit_id = ${unitA.id} and tenant_name = 'Jordan Reyes'
  limit 1
`;
if (!existingLease) {
  await sql`
    insert into leases (workspace_id, unit_id, tenant_name, start_date, end_date, rent_cents, deposit_cents, status)
    values (${workspace.id}, ${unitA.id}, 'Jordan Reyes', ${daysFromNow(-345)}, ${daysFromNow(20)}, 1450_00, 1450_00, 'active')
  `;
}

const [existingPolicy] = await sql`
  select id from policies
  where workspace_id = ${workspace.id} and property_id = ${property.id} and carrier = 'Lone Star Mutual'
  limit 1
`;
if (!existingPolicy) {
  await sql`
    insert into policies (workspace_id, property_id, carrier, policy_number, policy_type, annual_premium_cents, renewal_date)
    values (${workspace.id}, ${property.id}, 'Lone Star Mutual', 'LSM-88421', 'landlord_dwelling', 1140_00, ${daysFromNow(45)})
  `;
}

// Budget lines for the demo statement months (dollars -> cents).
const BUDGET = {
  rent: 2900_00,
  mgmt_fee: 232_00,
  repair: 200_00,
  maintenance: 100_00,
  insurance: 95_00,
};
for (const month of ["2026-03-01", "2026-04-01"]) {
  for (const [category, amountCents] of Object.entries(BUDGET)) {
    await sql`
      insert into budget_lines (workspace_id, property_id, category, month, amount_cents)
      values (${workspace.id}, ${property.id}, ${category}, ${month}, ${amountCents})
      on conflict (workspace_id, property_id, category, month) do update
        set amount_cents = excluded.amount_cents
    `;
  }
}

console.log(`seeded workspace "${workspace.slug}" (${workspace.id})`);
await sql.end();
