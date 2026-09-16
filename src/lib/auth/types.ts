// The auth module's public contract. Every page/action resolves the caller
// through `getSession()` (src/lib/auth/index.ts); providers are swappable
// behind this interface. `clerk` is the production provider when Clerk keys
// are set; `dev` is the local/self-serve provider gated behind
// APEX_DEV_AUTH_ENABLED (kept for machines without Clerk keys).

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
