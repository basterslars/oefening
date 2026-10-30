import type { FileType } from "@/lib/types";

const EXT_MAP: Record<string, FileType> = {
  pdf: "pdf",
  docx: "docx",
  pptx: "pptx",
  xlsx: "xlsx",
  txt: "txt",
  md: "md",
  markdown: "md",
  csv: "csv",
};

export const ACCEPT_ATTR = ".pdf,.docx,.pptx,.xlsx,.txt,.md,.markdown,.csv";
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export function detectFileType(fileName: string): FileType | null {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  return EXT_MAP[ext] ?? null;
}

export const LEGACY_HINT: Record<string, string> = {
  doc: "Oude Word-bestanden (.doc) worden niet ondersteund. Sla op als .docx.",
  ppt: "Oude PowerPoint-bestanden (.ppt) worden niet ondersteund. Sla op als .pptx.",
  xls: "Oude Excel-bestanden (.xls) worden niet ondersteund. Sla op als .xlsx.",
};
