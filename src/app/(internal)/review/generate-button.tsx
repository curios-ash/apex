"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";

import { generateReviewAction, type GenerateReviewState } from "./actions";

export function GenerateReviewButton(props: {
  propertyId: string;
  month: string;
  hasReview: boolean;
}) {
  const [state, action, pending] = useActionState<GenerateReviewState, FormData>(
    generateReviewAction,
    null,
  );

  return (
    <form action={action} className="flex items-center gap-3">
      <input type="hidden" name="propertyId" value={props.propertyId} />
      <input type="hidden" name="month" value={props.month} />
      <Button
        type="submit"
        disabled={pending}
        className="bg-emerald-700 text-white hover:bg-emerald-600"
      >
        {pending ? "Generating…" : props.hasReview ? "Regenerate review" : "Generate review"}
      </Button>
      {state ? (
        <span className={`text-xs ${state.ok ? "text-emerald-700" : "text-red-700"}`}>
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
