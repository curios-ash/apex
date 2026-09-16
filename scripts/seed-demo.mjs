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
// which is what the fee-drift rule catches.
const [agreement] = await sql`
  select id from pm_agreements
  where workspace_id = ${workspace.id} and property_id = ${property.id}
  limit 1
`;
if (!agreement) {
  await sql`
    insert into pm_agreements (workspace_id, property_id, pm_company_name, fee_bps, start_date)
    values (${workspace.id}, ${property.id}, 'Sunset Property Management', 800, '2026-01-01')
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
