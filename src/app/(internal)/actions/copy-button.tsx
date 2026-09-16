"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

// Copies the approved draft to the clipboard. The only client component on
// the queue — everything else is server-rendered forms.
export function CopyButton({ text, label = "Copy draft" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? "Copied ✓" : label}
    </Button>
  );
}
