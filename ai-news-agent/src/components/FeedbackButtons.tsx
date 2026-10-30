"use client";

import { useState } from "react";
import { Bookmark, Star, ThumbsDown, ThumbsUp } from "lucide-react";
import type { FeedbackAction } from "@/lib/types";

const BUTTONS: { action: FeedbackAction; label: string; icon: typeof ThumbsUp }[] = [
  { action: "like", label: "Interessant", icon: ThumbsUp },
  { action: "save", label: "Opslaan", icon: Bookmark },
  { action: "favorite", label: "Favoriet", icon: Star },
  { action: "dismiss", label: "Niet interessant", icon: ThumbsDown },
];

export function FeedbackButtons({ itemId, initial }: { itemId: string; initial: FeedbackAction[] }) {
  const [active, setActive] = useState<Set<FeedbackAction>>(new Set(initial));
  const [error, setError] = useState<string | null>(null);

  async function toggle(action: FeedbackAction) {
    const on = !active.has(action);
    const prev = active;
    const next = new Set(active);
    if (on) {
      next.add(action);
      if (action === "dismiss") ["like", "favorite"].forEach((a) => next.delete(a as FeedbackAction));
      if (action === "like" || action === "favorite") next.delete("dismiss");
    } else next.delete(action);
    setActive(next);
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId, action, on }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Opslaan mislukt");
    } catch (e) {
      setActive(prev);
      setError(e instanceof Error ? e.message : "Opslaan mislukt");
    }
  }

  return (
    <div className="flex items-center gap-1">
      {BUTTONS.map(({ action, label, icon: Icon }) => {
        const on = active.has(action);
        return (
          <button
            key={action}
            type="button"
            onClick={() => toggle(action)}
            title={label}
            aria-label={label}
            aria-pressed={on}
            className={`rounded-md p-1.5 transition ${
              on ? (action === "dismiss" ? "bg-red-500/10 text-red-600 dark:text-red-400" : "bg-accent-soft text-accent") : "text-muted hover:bg-line/60 hover:text-ink"
            }`}
          >
            <Icon size={15} fill={on && (action === "favorite" || action === "save") ? "currentColor" : "none"} />
          </button>
        );
      })}
      {error && <span className="ml-2 text-xs text-red-600">{error}</span>}
    </div>
  );
}
