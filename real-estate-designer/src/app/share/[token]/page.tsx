"use client";

import { Lock } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { PresentationViewer } from "@/components/PresentationViewer";
import { Button, Input, Notice } from "@/components/ui";
import { normalizeProject } from "@/lib/project";
import type { Project } from "@/lib/types";

type State = { kind: "loading" } | { kind: "ok"; project: Project; urls: Record<string, string> } | { kind: "passcode"; wrong: boolean } | { kind: "error"; message: string };

export default function SharedProject() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [code, setCode] = useState("");

  const load = useCallback(
    async (passcode?: string) => {
      const res = await fetch(`/api/share/${encodeURIComponent(token)}${passcode ? `?passcode=${encodeURIComponent(passcode)}` : ""}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({ status: "error" }));
      if (json.status === "ok") setState({ kind: "ok", project: normalizeProject(json.project), urls: json.mediaUrls ?? {} });
      else if (json.status === "passcode_required") setState({ kind: "passcode", wrong: !!passcode });
      else if (json.status === "not_configured") setState({ kind: "error", message: "Delen is op deze server niet geconfigureerd." });
      else setState({ kind: "error", message: "Deze link is ongeldig, verlopen of uitgeschakeld door de eigenaar." });
    },
    [token],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- gedeeld project ophalen
    load();
  }, [load]);

  if (state.kind === "loading") return <div className="flex min-h-screen items-center justify-center text-sm text-muted">Laden…</div>;
  if (state.kind === "error")
    return (
      <div className="mx-auto max-w-md px-6 py-24">
        <Notice tone="warn">{state.message}</Notice>
      </div>
    );
  if (state.kind === "passcode")
    return (
      <div className="mx-auto max-w-sm px-6 py-24">
        <form
          className="space-y-4 rounded-2xl border border-line bg-white p-6 shadow-soft"
          onSubmit={(e) => {
            e.preventDefault();
            load(code);
          }}
        >
          <div className="flex items-center gap-2 font-semibold">
            <Lock size={16} /> Toegangscode vereist
          </div>
          <p className="text-sm text-muted">De eigenaar heeft deze presentatie beveiligd met een toegangscode.</p>
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Toegangscode" autoFocus aria-label="Toegangscode" />
          {state.wrong && <p className="text-xs text-red-700">Onjuiste toegangscode.</p>}
          <Button type="submit" variant="primary" className="w-full">
            Openen
          </Button>
        </form>
      </div>
    );
  return (
    <div className="min-h-screen">
      <PresentationViewer project={state.project} urls={state.urls} />
      <footer className="pb-10 text-center text-xs text-muted">Gedeeld via AI Real Estate Designer · alleen-lezen weergave</footer>
    </div>
  );
}
