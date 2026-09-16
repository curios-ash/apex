"use client";

import { useId, useRef, useState } from "react";
import { AlertTriangle, FileSearch, Loader2, ShieldCheck, UploadCloud } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WaitlistForm } from "@/components/waitlist-form";
import { formatCents } from "@/lib/format";

interface AuditFlag {
  ruleId: string;
  severity: "info" | "warning" | "critical";
  dollarImpactCents: number;
  summary: string;
  detail: string;
  lines: { date: string | null; description: string; amountCents: number }[];
}

interface AuditResponse {
  ok: boolean;
  message?: string;
  elapsedMs?: number;
  statement?: {
    pmCompanyName: string | null;
    propertyAddress: string | null;
    periodStart: string | null;
    periodEnd: string | null;
    lineCount: number;
    incomeCents: number;
    mgmtFeeCents: number;
    feeBps: number;
  };
  flags?: AuditFlag[];
  totalFlaggedCents?: number;
}

type State =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; result: AuditResponse }
  | { status: "error"; message: string; rateLimited: boolean };

const SEVERITY_STYLES: Record<AuditFlag["severity"], string> = {
  critical: "border-red-200 bg-red-50",
  warning: "border-amber-200 bg-amber-50",
  info: "border-sky-200 bg-sky-50",
};

const SEVERITY_BADGE: Record<AuditFlag["severity"], string> = {
  critical: "bg-red-100 text-red-800",
  warning: "bg-amber-100 text-amber-800",
  info: "bg-sky-100 text-sky-800",
};

export function AuditTool() {
  const feeId = useId();
  const fileId = useId();
  const textId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [feePercent, setFeePercent] = useState("");
  const [text, setText] = useState("");
  const [state, setState] = useState<State>({ status: "idle" });

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file && text.trim().length < 40) {
      setState({
        status: "error",
        message: "Upload the statement PDF or paste its text — a few lines at least.",
        rateLimited: false,
      });
      return;
    }
    setState({ status: "running" });
    try {
      const formData = new FormData();
      formData.set("feePercent", feePercent);
      if (file) formData.set("file", file);
      else formData.set("text", text.trim());

      const response = await fetch("/api/audit", { method: "POST", body: formData });
      const data = (await response.json()) as AuditResponse;
      if (!response.ok || !data.ok) {
        setState({
          status: "error",
          message: data.message ?? "Something went wrong. Please try again.",
          rateLimited: response.status === 429,
        });
        return;
      }
      setState({ status: "done", result: data });
    } catch {
      setState({
        status: "error",
        message: "Couldn't reach the server. Check your connection and try again.",
        rateLimited: false,
      });
    }
  }

  const running = state.status === "running";

  return (
    <div className="space-y-6">
      <form
        onSubmit={onSubmit}
        className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8"
      >
        <div className="grid gap-6 sm:grid-cols-[1fr_180px]">
          <div>
            <Label htmlFor={fileId}>Owner statement (PDF or text)</Label>
            <div className="mt-1.5 flex items-center gap-3">
              <Input
                id={fileId}
                ref={fileRef}
                type="file"
                accept=".pdf,.txt,text/plain,application/pdf"
                disabled={running}
                className="bg-white"
              />
            </div>
            <p className="mt-2 text-xs text-stone-500">
              One recent owner statement from your property manager — AppFolio, Buildium,
              Propertyware, or similar.
            </p>
          </div>
          <div>
            <Label htmlFor={feeId}>Management fee %</Label>
            <div className="relative mt-1.5">
              <Input
                id={feeId}
                type="number"
                inputMode="decimal"
                min="0.1"
                max="25"
                step="0.1"
                required
                placeholder="8"
                value={feePercent}
                disabled={running}
                onChange={(e) => setFeePercent(e.target.value)}
                className="bg-white pr-8"
              />
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-stone-400">
                %
              </span>
            </div>
            <p className="mt-2 text-xs text-stone-500">From your management agreement.</p>
          </div>
        </div>

        <div className="mt-6">
          <Label htmlFor={textId}>…or paste the statement text</Label>
          <textarea
            id={textId}
            rows={5}
            disabled={running}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste the full statement text here if you don't have the PDF handy."
            className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-600 focus:outline-none"
          />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <Button
            type="submit"
            size="lg"
            disabled={running}
            className="h-11 bg-emerald-700 px-5 text-white hover:bg-emerald-800"
          >
            {running ? (
              <>
                <Loader2 className="animate-spin" aria-hidden />
                Auditing…
              </>
            ) : (
              <>
                <UploadCloud aria-hidden />
                Audit my statement
              </>
            )}
          </Button>
          <p className="flex items-center gap-1.5 text-xs text-stone-500">
            <ShieldCheck className="size-4 text-emerald-700" aria-hidden />
            Processed in memory and discarded immediately — your statement is never stored.
          </p>
        </div>

        {state.status === "error" ? (
          <p
            role="alert"
            className={`mt-4 rounded-xl border p-4 text-sm ${
              state.rateLimited
                ? "border-amber-200 bg-amber-50 text-amber-900"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {state.message}
          </p>
        ) : null}
      </form>

      {state.status === "done" && state.result.statement ? (
        <AuditResults result={state.result} />
      ) : null}
    </div>
  );
}

function AuditResults({ result }: { result: AuditResponse }) {
  const statement = result.statement!;
  const flags = result.flags ?? [];
  const total = result.totalFlaggedCents ?? 0;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold tracking-wide text-stone-500 uppercase">
              Audit result
            </p>
            <p className="mt-1 text-sm text-stone-600">
              {statement.pmCompanyName ?? "Your property manager"}
              {statement.propertyAddress ? ` · ${statement.propertyAddress}` : ""}
              {statement.periodStart && statement.periodEnd
                ? ` · ${statement.periodStart} → ${statement.periodEnd}`
                : ""}
              {` · ${statement.lineCount} line items · fee basis ${(statement.feeBps / 100).toFixed(2)}%`}
            </p>
          </div>
          {result.elapsedMs !== undefined ? (
            <p className="text-xs text-stone-400">
              in {(result.elapsedMs / 1000).toFixed(1)}s
            </p>
          ) : null}
        </div>

        <div className="mt-6 flex flex-wrap items-end gap-6">
          <div>
            <p className="text-sm text-stone-600">Total flagged</p>
            <p
              className={`mt-1 text-4xl font-semibold tracking-tight ${total > 0 ? "text-red-600" : "text-emerald-700"}`}
            >
              {formatCents(total)}
            </p>
          </div>
          <p className="max-w-md pb-1 text-sm text-stone-600">
            {total > 0
              ? `${flags.length} finding${flags.length === 1 ? "" : "s"} worth a conversation with your property manager. Collected income this period: ${formatCents(statement.incomeCents)}; management fees charged: ${formatCents(statement.mgmtFeeCents)}.`
              : `This statement reconciles cleanly against a ${(statement.feeBps / 100).toFixed(2)}% agreement — no fee drift, duplicates, unexplained charges, or aging work orders found.`}
          </p>
        </div>

        {flags.length > 0 ? (
          <ul className="mt-6 space-y-3">
            {flags.map((flag, i) => (
              <li key={i} className={`rounded-xl border p-4 ${SEVERITY_STYLES[flag.severity]}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-stone-900">{flag.summary}</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_BADGE[flag.severity]}`}
                  >
                    {flag.severity}
                  </span>
                </div>
                <p className="mt-1 text-sm text-stone-700">{flag.detail}</p>
                <ul className="mt-2 space-y-0.5 text-xs text-stone-500">
                  {flag.lines.map((l, j) => (
                    <li key={j} className="font-mono">
                      {l.date ?? "no date"} · {l.description} · {formatCents(l.amountCents)}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="rounded-2xl bg-stone-900 p-6 text-stone-50 sm:p-8">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-400" aria-hidden />
          <div>
            <h2 className="text-xl font-semibold tracking-tight">
              This was one statement. Your PM sends twelve a year.
            </h2>
            <p className="mt-2 max-w-xl text-sm text-stone-300">
              Save this audit to a property record and Apex will reconcile every future statement
              automatically — budget vs. actual, every exception with evidence, and the follow-up
              email drafted for your approval.
            </p>
          </div>
        </div>
        <div className="mt-5 max-w-md">
          <WaitlistForm source="audit-tool" />
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-stone-400">
          <FileSearch className="size-3.5" aria-hidden />
          Your statement was processed in memory and is already gone — join the list to build the
          record going forward.
        </p>
      </div>
    </div>
  );
}
