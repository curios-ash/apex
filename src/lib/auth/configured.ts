function present(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

export function isClerkConfigured(): boolean {
  return present(process.env.CLERK_SECRET_KEY) && present(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
}
