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
    insert into properties (workspace_id, name, address_line1, city, state, zip, property_type, latitude, longitude, geocoder, county, neighborhood, geo_source, purchase_price_cents, inbound_tag)
    values (${workspace.id}, '421 Maple Street', '421 Maple Street', 'Austin', 'TX', '78701', 'duplex', 30.2711, -97.7437, 'mock', 'Travis County', 'Downtown', 'mock-census-v1', 28900000, substring(replace(gen_random_uuid()::text, '-', ''), 1, 8))
    returning id
  `;
} else {
  await sql`
    update properties
    set county = coalesce(county, 'Travis County'),
        neighborhood = coalesce(neighborhood, 'Downtown'),
        geo_source = coalesce(geo_source, 'mock-census-v1'),
        latitude = coalesce(latitude, 30.2711),
        longitude = coalesce(longitude, -97.7437),
        purchase_price_cents = coalesce(purchase_price_cents, 28900000)
    where id = ${property.id}
  `;
}
await sql`
  update properties
  set inbound_tag = substring(replace(id::text, '-', ''), 1, 8)
  where id = ${property.id} and inbound_tag is null
`;

const PORTFOLIO_SEED = [
  {
    name: "88 Ocean Avenue",
    line1: "88 Ocean Avenue",
    city: "Miami Beach",
    state: "FL",
    zip: "33139",
    type: "fourplex",
    lat: 25.7907,
    lng: -80.13,
    county: "Miami-Dade County",
    neighborhood: "South Beach",
    price: 89000000,
    units: 4,
  },
  {
    name: "1500 W Division Street",
    line1: "1500 W Division Street",
    city: "Chicago",
    state: "IL",
    zip: "60642",
    type: "triplex",
    lat: 41.9033,
    lng: -87.6656,
    county: "Cook County",
    neighborhood: "Wicker Park",
    price: 54000000,
    units: 3,
  },
  {
    name: "1200 Main Street",
    line1: "1200 Main Street",
    city: "Houston",
    state: "TX",
    zip: "77002",
    type: "sfr",
    lat: 29.757,
    lng: -95.365,
    county: "Harris County",
    neighborhood: "Downtown",
    price: 27500000,
    units: 1,
  },
  {
    name: "301 Commerce Street",
    line1: "301 Commerce Street",
    city: "Fort Worth",
    state: "TX",
    zip: "76102",
    type: "duplex",
    lat: 32.755,
    lng: -97.332,
    county: "Tarrant County",
    neighborhood: "Downtown",
    price: 31000000,
    units: 2,
  },
  {
    name: "4550 N Central Avenue",
    line1: "4550 N Central Avenue",
    city: "Phoenix",
    state: "AZ",
    zip: "85012",
    type: "sfr",
    lat: 33.509,
    lng: -112.07,
    county: "Maricopa County",
    neighborhood: "Midtown",
    price: 41000000,
    units: 1,
  },
  {
    name: "1600 Pearl Street",
    line1: "1600 Pearl Street",
    city: "Boulder",
    state: "CO",
    zip: "80302",
    type: "condo",
    lat: 40.017,
    lng: -105.278,
    county: "Boulder County",
    neighborhood: "Downtown",
    price: 62500000,
    units: 1,
  },
];

for (const seed of PORTFOLIO_SEED) {
  let [row] = await sql`
    select id from properties
    where workspace_id = ${workspace.id} and name = ${seed.name}
    limit 1
  `;
  if (!row) {
    [row] = await sql`
      insert into properties (
        workspace_id, name, address_line1, city, state, zip, property_type, status,
        latitude, longitude, geocoder, county, neighborhood, geo_source, purchase_price_cents, inbound_tag
      )
      values (
        ${workspace.id}, ${seed.name}, ${seed.line1}, ${seed.city}, ${seed.state}, ${seed.zip}, ${seed.type}, 'active',
        ${seed.lat}, ${seed.lng}, 'mock', ${seed.county}, ${seed.neighborhood}, 'mock-census-v1', ${seed.price},
        substring(replace(gen_random_uuid()::text, '-', ''), 1, 8)
      )
      returning id
    `;
  }
  const existingUnits = await sql`
    select count(*)::int as n from units where property_id = ${row.id}
  `;
  if ((existingUnits[0]?.n ?? 0) === 0) {
    for (let i = 1; i <= seed.units; i += 1) {
      await sql`
        insert into units (workspace_id, property_id, label, status)
        values (${workspace.id}, ${row.id}, ${"Unit " + i}, 'vacant')
      `;
    }
  }
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
