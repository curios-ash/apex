export const DEFAULT_DATABASE_URL = "postgres://postgres:postgres@localhost:5432/apex";

export type PostgresClientOptions = {
  max: number;
  idle_timeout: number;
  max_lifetime: number;
  connect_timeout: number;
  prepare: boolean;
};

export function resolveDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.DATABASE_URL?.trim() || DEFAULT_DATABASE_URL;
}

export function isLocalDatabaseUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "::1";
  } catch {
    return /localhost|127\.0\.0\.1|::1/.test(url);
  }
}

export function isNeonDatabaseUrl(url: string): boolean {
  return /neon\.tech/i.test(url) || url.includes("-pooler.");
}

/** Fail closed on Vercel so we never try postgres://…@localhost inside a lambda. */
export function assertDatabaseUrlForRuntime(
  url: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.VERCEL !== "1") return;
  if (!env.DATABASE_URL?.trim()) {
    throw new Error(
      "DATABASE_URL is not set on Vercel. Link Neon under Storage and redeploy — internal pages cannot use localhost Postgres.",
    );
  }
  if (isLocalDatabaseUrl(url)) {
    throw new Error(
      "DATABASE_URL points at localhost on Vercel. Use the Neon connection string injected by Storage.",
    );
  }
}

export function postgresClientOptions(
  url: string,
  env: NodeJS.ProcessEnv = process.env,
): PostgresClientOptions {
  const serverless = env.VERCEL === "1" || isNeonDatabaseUrl(url);
  return {
    // Neon pooler + Vercel lambdas: one connection per isolate, no named
    // prepared statements (the transaction pooler rejects them).
    max: serverless ? 1 : 10,
    idle_timeout: serverless ? 20 : 30,
    max_lifetime: serverless ? 60 * 30 : 0,
    connect_timeout: 10,
    prepare: !serverless,
  };
}
