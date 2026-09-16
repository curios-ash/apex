"use client";

import { useId, useState } from "react";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isValidEmail, normalizeEmail } from "@/lib/waitlist";

type FormState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success"; alreadyJoined: boolean }
  | { status: "error"; message: string };

export function WaitlistForm({ source = "landing" }: { source?: string }) {
  const inputId = useId();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<FormState>({ status: "idle" });

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeEmail(email);
    if (!isValidEmail(normalized)) {
      setState({
        status: "error",
        message: "That doesn't look like a valid email address.",
      });
      return;
    }
    setState({ status: "submitting" });
    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalized, source }),
      });
      const data = (await response.json()) as {
        ok: boolean;
        alreadyJoined?: boolean;
        message?: string;
      };
      if (!response.ok || !data.ok) {
        setState({
          status: "error",
          message: data.message ?? "Something went wrong. Please try again.",
        });
        return;
      }
      setState({ status: "success", alreadyJoined: data.alreadyJoined ?? false });
    } catch {
      setState({
        status: "error",
        message: "Couldn't reach the server. Check your connection and try again.",
      });
    }
  }

  if (state.status === "success") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-left">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden />
        <div>
          <p className="font-medium text-emerald-900">
            {state.alreadyJoined ? "You're already on the list." : "You're on the list."}
          </p>
          <p className="mt-1 text-sm text-emerald-800">
            {state.alreadyJoined
              ? "We have your email already — we'll reach out as soon as your invite is ready."
              : "We'll email you as soon as your invite is ready. Founding members get the concierge beta free."}
          </p>
        </div>
      </div>
    );
  }

  const submitting = state.status === "submitting";

  return (
    <form onSubmit={onSubmit} noValidate className="w-full">
      <div className="flex w-full flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <label htmlFor={inputId} className="sr-only">
            Email address
          </label>
          <Input
            id={inputId}
            type="email"
            name="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            disabled={submitting}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={state.status === "error"}
            aria-describedby={state.status === "error" ? `${inputId}-error` : undefined}
            className="h-11 bg-white text-base"
          />
        </div>
        <Button
          type="submit"
          size="lg"
          disabled={submitting}
          className="h-11 bg-emerald-700 px-5 text-white hover:bg-emerald-800"
        >
          {submitting ? (
            <>
              <Loader2 className="animate-spin" aria-hidden />
              Joining…
            </>
          ) : (
            <>
              Join the waitlist
              <ArrowRight aria-hidden />
            </>
          )}
        </Button>
      </div>
      {state.status === "error" ? (
        <p id={`${inputId}-error`} role="alert" className="mt-2 text-sm text-red-600">
          {state.message}
        </p>
      ) : (
        <p className="mt-2 text-sm text-stone-500">
          Free while in beta. No credit card, no PM switch required.
        </p>
      )}
    </form>
  );
}
