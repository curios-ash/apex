"use client";

import { SignOutButton } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";

export function ClerkSignOut() {
  return (
    <SignOutButton redirectUrl="/sign-in">
      <Button type="button" variant="outline" size="xs">
        Sign out
      </Button>
    </SignOutButton>
  );
}
