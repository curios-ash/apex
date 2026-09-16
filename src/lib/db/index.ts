import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

export const DEFAULT_DATABASE_URL = "postgres://postgres:postgres@localhost:5432/apex";

const connectionString = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;

// Reuse the connection across Next.js dev hot reloads. postgres.js connects
// lazily, so importing this module never touches the database by itself.
const globalForDb = globalThis as unknown as { sql?: postgres.Sql };

const sql = globalForDb.sql ?? postgres(connectionString);
if (process.env.NODE_ENV !== "production") {
  globalForDb.sql = sql;
}

export const db = drizzle(sql, { schema });
export { schema };
