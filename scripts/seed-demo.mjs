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

const [property] = await sql`
  select id from properties
  where workspace_id = ${workspace.id} and name = '421 Maple Street'
  limit 1
`;
if (!property) {
  await sql`
    insert into properties (workspace_id, name, address_line1, city, state, zip, property_type)
    values (${workspace.id}, '421 Maple Street', '421 Maple Street', 'Austin', 'TX', '78701', 'duplex')
  `;
}

console.log(`seeded workspace "${workspace.slug}" (${workspace.id})`);
await sql.end();
