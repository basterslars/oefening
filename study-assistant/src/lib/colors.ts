export const COURSE_COLORS: Record<string, string> = {
  slate: "#64748b",
  indigo: "#6366f1",
  violet: "#8b5cf6",
  sky: "#0ea5e9",
  teal: "#14b8a6",
  emerald: "#10b981",
  amber: "#f59e0b",
  orange: "#f97316",
  rose: "#f43f5e",
};

export const courseColor = (name: string | null | undefined) => COURSE_COLORS[name ?? "slate"] ?? COURSE_COLORS.slate;
