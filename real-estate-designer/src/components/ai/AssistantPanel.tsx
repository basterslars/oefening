"use client";

import { Eye, Sparkles, Wand2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { getCapabilities, proposeDesign, AIClientError } from "@/lib/ai/client";
import { applyProposal, buildDesignContext, type AppliedProposal } from "@/lib/ai/apply";
import type { AICapabilities, DesignProposal } from "@/lib/ai/schemas";
import { useEditor } from "@/lib/editor/store";
import { activeVariant, newVariant, nowIso, uid } from "@/lib/project";
import { Badge, Button, Modal, Notice, Select, Spinner, Textarea } from "../ui";

const Scene3D = dynamic(() => import("@/components/editor3d/Scene3D").then((m) => m.Scene3D), { ssr: false });

const EXAMPLES = [
  "Richt deze woonkamer modern en minimalistisch in.",
  "Maak van deze slaapkamer een luxe hotelsuite.",
  "Gebruik lichte kleuren en natuurlijke materialen.",
  "Maak de ruimte geschikt voor een jong stel.",
  "Laat zien hoe deze woning eruitziet met een Scandinavisch interieur.",
  "Maak drie verschillende interieurvarianten.",
  "Behoud de bestaande keuken maar verander de woonkamer.",
];

export function AssistantPanel() {
  const project = useEditor((s) => s.project)!;
  const selection = useEditor((s) => s.selection);
  const [caps, setCaps] = useState<AICapabilities | null>(null);
  const [prompt, setPrompt] = useState("");
  const [count, setCount] = useState(1);
  const [roomId, setRoomId] = useState<string>("");
  const [base, setBase] = useState<"current" | "empty">("current");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ proposal: DesignProposal; applied: AppliedProposal[]; model: string; analysisId: string } | null>(null);
  const [preview, setPreview] = useState<AppliedProposal | null>(null);

  useEffect(() => {
    getCapabilities().then(setCaps);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- volg selectie in de editor
    if (selection?.kind === "room") setRoomId(selection.id);
  }, [selection]);

  const effectiveCount = /drie|3 (verschillende|varianten)/i.test(prompt) ? 3 : /twee|2 (verschillende|varianten)/i.test(prompt) ? Math.max(count, 2) : count;

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const p = useEditor.getState().project!;
      const baseVariant = base === "current" ? activeVariant(p) : newVariant();
      const ctx = buildDesignContext(p, baseVariant, prompt, effectiveCount, roomId || null);
      const res = await proposeDesign(ctx);
      const applied = res.result.variants.map((v) => applyProposal(p, baseVariant, v));
      const analysisId = uid("ai");
      useEditor.getState().update(
        (d) => {
          d.analyses.push({ id: analysisId, kind: "design", provider: res.provider, model: res.model, createdAt: nowIso(), result: { prompt, proposal: res.result }, status: "pending" });
        },
        { history: false },
      );
      setResult({ proposal: res.result, applied, model: res.model, analysisId });
    } catch (e) {
      setError(e instanceof AIClientError ? e.message : `Er ging iets mis: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  function accept(a: AppliedProposal, mode: "new" | "replace") {
    const st = useEditor.getState();
    if (mode === "replace") {
      const cur = activeVariant(st.project!);
      st.upsertVariant({ ...a.variant, id: cur.id, name: cur.name, createdAt: cur.createdAt });
    } else st.upsertVariant(a.variant);
    st.update((d) => {
      const an = d.analyses.find((x) => x.id === result?.analysisId);
      if (an) an.status = "applied";
    }, { history: false });
    st.setNotice({ text: `Voorstel "${a.variant.name}" toegepast. U kunt alles nog aanpassen of ongedaan maken.`, tone: "info" });
  }

  const roomOptions = useMemo(() => project.plan.rooms, [project.plan.rooms]);

  if (caps && !caps.design.available)
    return (
      <div className="space-y-3 p-4">
        <Notice tone="info">
          <strong>AI-ontwerpassistent niet geconfigureerd.</strong> Voeg een <code>ANTHROPIC_API_KEY</code> toe aan <code>.env.local</code> om inrichtingsvoorstellen in natuurlijke taal te laten genereren (zie README). Er worden geen gesimuleerde voorstellen getoond.
        </Notice>
        <p className="text-[13px] text-muted">U kunt de woning volledig handmatig inrichten via de meubelbibliotheek, en stijlen vergelijken met ontwerpvarianten.</p>
      </div>
    );

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ai-soft text-ai">
          <Sparkles size={16} />
        </span>
        <div>
          <div className="text-sm font-semibold">AI Interior Design Assistant</div>
          <div className="text-[11px] text-muted">{caps?.design.model ? `Model: ${caps.design.model}` : "Beschikbaarheid controleren…"}</div>
        </div>
      </div>
      <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder="Beschrijf hoe u de ruimte wilt inrichten…" rows={4} aria-label="Opdracht voor de AI-assistent" />
      <div className="flex flex-wrap gap-1.5">
        {EXAMPLES.map((ex) => (
          <button key={ex} onClick={() => setPrompt(ex)} className="rounded-full bg-stone-100 px-2.5 py-1 text-left text-[11px] text-stone-700 hover:bg-stone-200">
            {ex}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[12px]">
          <span className="mb-1 block font-medium">Ruimte</span>
          <Select value={roomId} onChange={(e) => setRoomId(e.target.value)} className="h-9 py-0 text-[13px]">
            <option value="">Hele woning</option>
            {roomOptions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="text-[12px]">
          <span className="mb-1 block font-medium">Varianten</span>
          <Select value={count} onChange={(e) => setCount(parseInt(e.target.value))} className="h-9 py-0 text-[13px]">
            <option value={1}>1 voorstel</option>
            <option value={2}>2 voorstellen</option>
            <option value={3}>3 voorstellen</option>
          </Select>
        </label>
        <label className="col-span-2 text-[12px]">
          <span className="mb-1 block font-medium">Uitgangspunt</span>
          <Select value={base} onChange={(e) => setBase(e.target.value as "current" | "empty")} className="h-9 py-0 text-[13px]">
            <option value="current">Huidige inrichting ({activeVariant(project).furniture.length} objecten) behouden en aanpassen</option>
            <option value="empty">Vanaf lege woning</option>
          </Select>
        </label>
      </div>
      {project.plan.rooms.length === 0 && <Notice tone="warn">Teken eerst ruimtes in de plattegrond; de AI plaatst meubels binnen ruimtes.</Notice>}
      <Button variant="ai" className="w-full" onClick={run} disabled={busy || !prompt.trim() || project.plan.rooms.length === 0}>
        {busy ? <Spinner /> : <Wand2 size={16} />} {busy ? "Voorstel wordt gemaakt…" : `Maak ${effectiveCount > 1 ? `${effectiveCount} voorstellen` : "voorstel"}`}
      </Button>
      {error && <Notice tone="error">{error}</Notice>}

      {result && (
        <div className="space-y-3">
          <Notice tone="ai">
            {result.proposal.summary}
            <span className="mt-1 block text-[11px] opacity-80">AI-voorstel ({result.model}). Bekijk en keur goed voordat het in uw ontwerp komt.</span>
          </Notice>
          {result.applied.map((a, i) => {
            const pv = result.proposal.variants[i];
            return (
              <div key={i} className="rounded-xl border border-line p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold">{pv.name}</div>
                    <div className="text-[11px] text-muted">{pv.style}</div>
                  </div>
                  <Badge tone="ai">Voorstel</Badge>
                </div>
                <p className="mt-2 text-[12.5px] leading-relaxed text-stone-700">{pv.rationale}</p>
                <ul className="mt-2 space-y-0.5 text-[12px] text-muted">
                  <li>+ {a.added} objecten geplaatst{a.moved ? ` (${a.moved} iets verschoven om botsingen te voorkomen)` : ""}</li>
                  {pv.remove.length > 0 && <li>− {pv.remove.length} bestaande objecten verwijderd</li>}
                  {pv.recolor.length > 0 && <li>~ {pv.recolor.length} objecten van kleur/materiaal veranderd</li>}
                  {pv.roomFinishes.length > 0 && <li>~ afwerking van {pv.roomFinishes.length} ruimte(s) aangepast</li>}
                </ul>
                {a.skipped.length > 0 && (
                  <details className="mt-2 text-[12px] text-amber-800">
                    <summary className="cursor-pointer">{a.skipped.length} object(en) konden niet geplaatst worden</summary>
                    <ul className="mt-1 list-disc pl-4">
                      {a.skipped.map((s, j) => (
                        <li key={j}>
                          {s.name}: {s.reason}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" icon={<Eye size={14} />} onClick={() => setPreview(a)}>
                    Bekijk in 3D
                  </Button>
                  <Button size="sm" variant="primary" onClick={() => accept(a, "new")}>
                    Toepassen als nieuwe variant
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => accept(a, "replace")}>
                    Vervang huidige
                  </Button>
                </div>
              </div>
            );
          })}
          {result.proposal.limitations.length > 0 && (
            <details className="text-[12px] text-muted">
              <summary className="cursor-pointer">Beperkingen volgens de AI</summary>
              <ul className="mt-1 list-disc pl-4">
                {result.proposal.limitations.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <Modal open={!!preview} onClose={() => setPreview(null)} title={`Voorbeeld: ${preview?.variant.name ?? ""}`} wide footer={preview && (<><Button onClick={() => setPreview(null)}>Sluiten</Button><Button variant="primary" onClick={() => (accept(preview, "new"), setPreview(null))}>Toepassen als nieuwe variant</Button></>)}>
        {preview && (
          <div className="h-[60vh] overflow-hidden rounded-xl">
            <Scene3D plan={project.plan} variant={preview.variant} ceilingHeight={project.ceilingHeight.value} showFurniture wallMode="cutaway" cameraMode="orbit" className="h-full w-full" />
          </div>
        )}
        <p className="mt-2 text-xs text-muted">Voorbeeld van het voorstel als bewerkbaar 3D-model. Er is nog niets gewijzigd in uw ontwerp.</p>
      </Modal>
    </div>
  );
}
