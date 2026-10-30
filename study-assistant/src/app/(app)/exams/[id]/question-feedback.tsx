import { FileText } from "lucide-react";
import type { SourceRef } from "@/lib/types";
import { Markdown } from "@/components/markdown";
import { cn } from "@/lib/utils";

export function QuestionFeedback({ points, maxPoints, feedback, correctAnswer, explanation, sources, isMc, options }: {
  points: number;
  maxPoints: number;
  feedback: string | null;
  correctAnswer: string;
  explanation: string | null;
  sources: SourceRef[];
  isMc: boolean;
  options: string[] | null;
}) {
  const ratio = maxPoints ? points / maxPoints : 0;
  const tone = ratio >= 0.75 ? "border-success/40 bg-success/5" : ratio >= 0.4 ? "border-warning/50 bg-warning/8" : "border-danger/40 bg-danger/5";
  const mcText = isMc && options ? options["ABCDEF".indexOf(correctAnswer)] : null;
  return (
    <div className={cn("mt-4 space-y-3 rounded-lg border p-4 text-sm", tone)}>
      <p className="font-medium">
        {points} / {maxPoints} punt{maxPoints === 1 ? "" : "en"}
      </p>
      {feedback && <Markdown className="text-sm">{feedback}</Markdown>}
      <div>
        <p className="text-xs font-medium text-muted-foreground">Juist antwoord</p>
        <Markdown>{isMc ? `**${correctAnswer}**${mcText ? `: ${mcText}` : ""}` : correctAnswer}</Markdown>
      </div>
      {explanation && (
        <div>
          <p className="text-xs font-medium text-muted-foreground">Uitleg</p>
          <Markdown>{explanation}</Markdown>
        </div>
      )}
      {sources.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">Bestudeer opnieuw</p>
          <div className="flex flex-wrap gap-1.5">
            {sources.map((s) => (
              <span key={s.id} className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-1.5 py-0.5 text-[11px] text-muted-foreground">
                <FileText className="size-3" /> {s.document_name}
                {s.location ? `, ${s.location}` : ""}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
