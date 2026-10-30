import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { cn } from "@/lib/utils";

/** Rendert AI-antwoorden (Markdown + LaTeX). Ruwe HTML wordt niet uitgevoerd. */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("prose-study text-sm", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false }]]}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
