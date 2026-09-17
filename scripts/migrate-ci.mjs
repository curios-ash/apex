#!/usr/bin/env node
// Apply drizzle migrations when a real DATABASE_URL is present.
// Local `next build` without Neon stays offline. Vercel builds fail closed
// if Storage never injected DATABASE_URL — otherwise /deals 500s at runtime.

import { spawnSync } from "node:child_process";

const url = process.env.DATABASE_URL?.trim();
const onVercel = process.env.VERCEL === "1";

if (onVercel && !url) {
  console.error(
    "DATABASE_URL is not set. Link Neon (Vercel Storage) so preview/prod can migrate and serve /deals.",
  );
  process.exit(1);
}

if (!url) {
  console.log("migrate-ci: skip (DATABASE_URL unset)");
  process.exit(0);
}

const result = spawnSync("npx", ["drizzle-kit", "migrate"], {
  stdio: "inherit",
  env: process.env,
});
process.exit(result.status ?? 1);
