"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";

import { devSignIn, type DevSignInState } from "./actions";

export function SignInForm(props: {
  workspaces: { id: string; name: string; slug: string }[];
}) {
  const [state, action, pending] = useActionState<DevSignInState, FormData>(devSignIn, null);

  return (
    <form action={action} className="mt-5 space-y-4">
      <div>
        <label htmlFor="email" className="text-sm font-medium text-stone-700">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          placeholder="you@example.com"
          className="mt-1 block w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-stone-400">
          A new email joins the workspace below; an existing email signs into its own workspace.
        </p>
      </div>
      <div>
        <label htmlFor="workspaceId" className="text-sm font-medium text-stone-700">
          Workspace
        </label>
        <select
          id="workspaceId"
          name="workspaceId"
          required
          className="mt-1 block w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
        >
          {props.workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name} ({w.slug})
            </option>
          ))}
        </select>
      </div>

      {state ? (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${
            state.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"
          }`}
        >
          {state.message}
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={pending}
        className="w-full bg-emerald-700 text-white hover:bg-emerald-600"
      >
        {pending ? "Signing in…" : "Sign in (dev)"}
      </Button>
    </form>
  );
}
