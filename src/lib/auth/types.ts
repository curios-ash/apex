// The auth module's public contract. Every page/action resolves the caller
// through `getSession()` (src/lib/auth/index.ts); providers are swappable
// behind this interface. `dev` is the self-serve provider gated behind
// APEX_DEV_AUTH_ENABLED; `clerk` is the production provider (stubbed — see
// clerk.ts for the exact integration points).

export interface ApexSession {
  userId: string;
  email: string;
  workspaceId: string;
  workspaceSlug: string;
  provider: "dev" | "clerk";
}

export interface AuthProvider {
  name: ApexSession["provider"];
  getSession(): Promise<ApexSession | null>;
}
