"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";

import { mockSetPlan, type BillingState } from "./actions";

// Mock-mode plan switcher (STRIPE_ENABLED off). Writes the plan columns
// directly so the whole billing surface is exercisable without Stripe keys.
export function MockSwitcher(props: { planId: string; planName: string; isCurrent: boolean }) {
  const [state, action, pending] = useActionState<BillingState, FormData>(mockSetPlan, null);

  if (props.isCurrent) {
    return <span className="text-xs text-stone-400">Your current plan.</span>;
  }

  return (
    <form action={action}>
      <input type="hidden" name="plan" value={props.planId} />
      <Button type="submit" variant="outline" disabled={pending} className="w-full">
        {pending ? "Switching…" : `Switch to ${props.planName} (mock)`}
      </Button>
      {state && !state.ok ? (
        <p className="mt-2 text-xs text-red-700">{state.message}</p>
      ) : null}
    </form>
  );
}
