"use client";

import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useEditor } from "@/lib/editor/store";
import { Badge, Button, Field, Input, Modal, Select, cx } from "../ui";

export const STYLES = ["Eigen ontwerp", "Modern", "Minimalistisch", "Scandinavisch", "Japandi", "Industrieel", "Klassiek", "Landelijk", "Luxe hotel", "Mid-century", "Boho"];

export function VariantBar() {
  const project = useEditor((s) => s.project)!;
  const [dialog, setDialog] = useState<null | { mode: "new" | "rename"; id?: string }>(null);
  const st = useEditor.getState;
  return (
    <div className="flex items-center gap-2 overflow-x-auto border-t border-line bg-white px-3 py-2">
      <span className="shrink-0 text-[12px] font-semibold uppercase tracking-wider text-muted">Varianten</span>
      {project.variants.map((v) => {
        const active = v.id === project.activeVariantId;
        return (
          <div key={v.id} className={cx("group flex shrink-0 items-center rounded-lg border", active ? "border-accent bg-accent-soft" : "border-line bg-white")}>
            <button onClick={() => st().setActiveVariant(v.id)} className="flex items-center gap-2 px-3 py-1.5 text-[13px]" data-testid="variant-chip">
              <span className={active ? "font-semibold text-accent" : ""}>{v.name}</span>
              <Badge>{v.furniture.length}</Badge>
              {v.furniture.some((f) => f.source === "ai_proposal") && <Badge tone="ai">AI</Badge>}
            </button>
            {active && (
              <span className="flex pr-1">
                <button className="rounded p-1 text-muted hover:bg-white hover:text-ink" title="Hernoemen" onClick={() => setDialog({ mode: "rename", id: v.id })}>
                  <Pencil size={13} />
                </button>
                <button className="rounded p-1 text-muted hover:bg-white hover:text-ink" title="Dupliceren" onClick={() => st().addVariant(`${v.name} (kopie)`, v.style, "copy")}>
                  <Copy size={13} />
                </button>
                {project.variants.length > 1 && (
                  <button className="rounded p-1 text-muted hover:bg-white hover:text-red-700" title="Verwijderen" onClick={() => confirm(`Variant "${v.name}" verwijderen?`) && st().deleteVariant(v.id)}>
                    <Trash2 size={13} />
                  </button>
                )}
              </span>
            )}
          </div>
        );
      })}
      <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => setDialog({ mode: "new" })}>
        Nieuwe variant
      </Button>
      <VariantDialog dialog={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}

function VariantDialog({ dialog, onClose }: { dialog: null | { mode: "new" | "rename"; id?: string }; onClose(): void }) {
  const project = useEditor((s) => s.project)!;
  const existing = dialog?.id ? project.variants.find((v) => v.id === dialog.id) : null;
  return (
    <Modal open={!!dialog} onClose={onClose} title={dialog?.mode === "new" ? "Nieuwe ontwerpvariant" : "Variant hernoemen"}>
      {dialog && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const name = String(f.get("name")).trim() || "Variant";
            const style = String(f.get("style"));
            if (dialog.mode === "new") useEditor.getState().addVariant(name, style, f.get("base") === "copy" ? "copy" : "empty");
            else if (existing) useEditor.getState().renameVariant(existing.id, name, style);
            onClose();
          }}
          className="space-y-4"
        >
          <Field label="Naam">
            <Input name="name" defaultValue={existing?.name ?? `Variant ${project.variants.length + 1}`} autoFocus onKeyDown={(e) => e.stopPropagation()} />
          </Field>
          <Field label="Stijl">
            <Select name="style" defaultValue={existing?.style ?? "Eigen ontwerp"}>
              {STYLES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
          {dialog.mode === "new" && (
            <Field label="Beginnen met">
              <Select name="base" defaultValue="empty">
                <option value="empty">Lege woning</option>
                <option value="copy">Kopie van de actieve variant</option>
              </Select>
            </Field>
          )}
          <div className="flex justify-end gap-2">
            <Button onClick={onClose}>Annuleren</Button>
            <Button type="submit" variant="primary">
              {dialog.mode === "new" ? "Aanmaken" : "Opslaan"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
