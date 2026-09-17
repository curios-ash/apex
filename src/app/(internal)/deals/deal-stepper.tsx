"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const STEPS = [
  { href: (id: string) => `/deals/${id}`, label: "Overview", match: "overview" },
  { href: (id: string) => `/deals/${id}/capture`, label: "Capture", match: "capture" },
  { href: (id: string) => `/deals/${id}/calculator`, label: "Underwrite", match: "calculator" },
  { href: (id: string) => `/deals/${id}/checklist`, label: "Checklist", match: "checklist" },
  { href: (id: string) => `/deals/${id}/share`, label: "Share", match: "share" },
] as const;

function currentStep(pathname: string, dealId: string): string {
  if (pathname.endsWith("/capture")) return "capture";
  if (pathname.endsWith("/calculator")) return "calculator";
  if (pathname.endsWith("/checklist")) return "checklist";
  if (pathname.endsWith("/share")) return "share";
  if (pathname.endsWith("/history")) return "history";
  if (pathname === `/deals/${dealId}`) return "overview";
  return "overview";
}

export function DealStepper({ dealId }: { dealId: string }) {
  const pathname = usePathname();
  const current = currentStep(pathname, dealId);
  return (
    <nav aria-label="Buyer path" className="overflow-x-auto">
      <ol className="flex min-w-max gap-1 rounded-full border border-[#d7cbb8] bg-[#fffaf1] p-1">
        {STEPS.map((step, index) => {
          const active = current === step.match;
          return (
            <li key={step.match}>
              <Link
                href={step.href(dealId)}
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium sm:text-sm ${
                  active ? "bg-[#1c1914] text-[#f4e6c8]" : "text-[#5c5549] hover:text-[#1c1914]"
                }`}
              >
                <span className="tabular-nums opacity-60">{index + 1}</span>
                {step.label}
              </Link>
            </li>
          );
        })}
        <li>
          <Link
            href={`/deals/${dealId}/history`}
            className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium sm:text-sm ${
              current === "history" ? "bg-[#1c1914] text-[#f4e6c8]" : "text-[#5c5549]"
            }`}
          >
            History
          </Link>
        </li>
      </ol>
    </nav>
  );
}

