import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import {
  assertDatabaseUrlForRuntime,
  postgresClientOptions,
  resolveDatabaseUrl,
} from "./postgres-options";
import * as schema from "./schema";

export { DEFAULT_DATABASE_URL } from "./postgres-options";

const connectionString = resolveDatabaseUrl();
assertDatabaseUrlForRuntime(connectionString);

// Reuse the client across hot reloads *and* warm Vercel isolates. postgres.js
// still connects lazily; importing this module does not open a socket.
const globalForDb = globalThis as unknown as { sql?: postgres.Sql };

const sql =
  globalForDb.sql ?? postgres(connectionString, postgresClientOptions(connectionString));
globalForDb.sql = sql;

export const db = drizzle(sql, { schema });
export { schema };
