"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Spinner } from "@/components/ui/misc";

export function CoachReviewButton({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        disabled={busy || disabled}
        title={disabled ? "AI niet geconfigureerd" : undefined}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const res = await fetch("/api/coach", { method: "POST" });
          const json = await res.json().catch(() => ({}));
          setBusy(false);
          if (!res.ok) return setError(json.error ?? "Evaluatie mislukt.");
          router.refresh();
        }}
      >
        {busy ? <Spinner /> : <Sparkles />} Evalueer mijn voortgang
      </Button>
      {error && <Alert tone="danger">{error}</Alert>}
    </div>
  );
}
