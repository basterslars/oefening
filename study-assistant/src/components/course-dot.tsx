import { courseColor } from "@/lib/colors";

export function CourseDot({ color, className = "" }: { color: string | null | undefined; className?: string }) {
  return <span className={`inline-block size-2.5 shrink-0 rounded-full ${className}`} style={{ background: courseColor(color) }} aria-hidden />;
}
