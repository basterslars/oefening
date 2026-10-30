"use client";

import { ArrowLeft, Check, CloudOff, Loader2, Redo2, Undo2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { Logo } from "@/components/AppHeader";
import { AnalysisTab } from "@/components/project/AnalysisTab";
import { DesignWorkspace } from "@/components/project/DesignWorkspace";
import { OverviewTab } from "@/components/project/OverviewTab";
import { PresentationTab } from "@/components/project/PresentationTab";
import { StagingTab } from "@/components/staging/StagingTab";
import { IconButton, Notice, Select, cx } from "@/components/ui";
import { sceneCapture } from "@/lib/editor/capture";
import { useEditor } from "@/lib/editor/store";
import { getRepository } from "@/lib/storage";
import { STATUS_LABELS, type ProjectStatus } from "@/lib/types";

const TABS = [
  { id: "overzicht", label: "Overzicht" },
  { id: "ontwerp", label: "Plattegrond & 3D" },
  { id: "analyse", label: "AI-analyse" },
  { id: "staging", label: "Virtual staging" },
  { id: "presentatie", label: "Presentatie & delen" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default function ProjectPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-muted">Laden…</div>}>
      <ProjectPageInner />
    </Suspense>
  );
}

function ProjectPageInner() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const project = useEditor((s) => s.project);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "pending" | "error">("saved");
  const initialTab = search.get("tab");
  const [tab, setTab] = useState<TabId>(initialTab === "plattegrond" || initialTab === "3d" ? "ontwerp" : ((TABS.find((t) => t.id === initialTab)?.id ?? "ontwerp") as TabId));
  const [view, setViewMode] = useState<"2d" | "3d" | "split">(initialTab === "3d" ? "3d" : "2d");

  // Laden
  useEffect(() => {
    let alive = true;
    getRepository()
      .get(id)
      .then((p) => {
        if (!alive) return;
        if (!p) setError("Dit project bestaat niet (meer) of u heeft er geen toegang toe.");
        else useEditor.getState().load(p);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
      useEditor.getState().unload();
    };
  }, [id]);

  // Autosave: elke wijziging wordt na een korte pauze opgeslagen
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastThumb = useRef(0);
  const saving = useRef<Promise<void> | null>(null);
  const latest = useRef<ReturnType<typeof useEditor.getState>["project"]>(null);
  useEffect(() => {
    const save = async () => {
      timer.current = null;
      // Bij het verlaten van de pagina kan de store al geleegd zijn; gebruik dan de laatst bekende versie
      let p = useEditor.getState().project ?? latest.current;
      if (!p) return;
      if (sceneCapture.current && Date.now() - lastThumb.current > 15000) {
        try {
          const thumb = sceneCapture.current.capture({ width: 480, type: "image/jpeg", quality: 0.8 });
          lastThumb.current = Date.now();
          p = { ...p, thumbnail: thumb };
          useEditor.setState({ project: p }); // stil bijwerken, geen nieuwe revisie
        } catch {}
      }
      setSaveState("saving");
      try {
        await saving.current;
        saving.current = getRepository().save(p);
        await saving.current;
        setSaveState(timer.current ? "pending" : "saved");
      } catch (e) {
        console.error(e);
        setSaveState("error");
      }
    };
    const unsub = useEditor.subscribe((s, prev) => {
      if (s.project) latest.current = s.project;
      if (s.revision === prev.revision || !s.project || s.project.id !== prev.project?.id) return;
      setSaveState("pending");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(save, 700);
    });
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (timer.current) {
        clearTimeout(timer.current);
        save();
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      unsub();
      window.removeEventListener("beforeunload", beforeUnload);
      if (timer.current) {
        clearTimeout(timer.current);
        save();
      }
    };
  }, []);

  const switchTab = (t: TabId) => {
    setTab(t);
    const q = new URLSearchParams(search.toString());
    q.set("tab", t);
    q.delete("calibrate");
    router.replace(`?${q.toString()}`, { scroll: false });
  };

  if (error)
    return (
      <div className="mx-auto max-w-lg px-6 py-24">
        <Notice tone="error">{error}</Notice>
        <Link href="/" className="mt-4 inline-block text-sm text-accent hover:underline">
          ← Terug naar projecten
        </Link>
      </div>
    );
  if (!project || project.id !== id) return <div className="flex min-h-screen items-center justify-center text-sm text-muted">Project laden…</div>;

  return (
    <div className="flex h-dvh flex-col">
      <header className="z-30 border-b border-line bg-white">
        <div className="flex h-14 items-center gap-3 px-3 sm:px-4">
          <Link href="/" className="rounded-lg p-1.5 text-muted hover:bg-stone-100 hover:text-ink" aria-label="Terug naar projecten">
            <ArrowLeft size={18} />
          </Link>
          <div className="hidden md:block">
            <Logo />
          </div>
          <span className="hidden h-6 w-px bg-line md:block" />
          <ProjectName />
          <Select
            value={project.status}
            onChange={(e) => useEditor.getState().update((d) => void (d.status = e.target.value as ProjectStatus), { history: false })}
            className="hidden h-8 w-auto py-0 text-[13px] sm:block"
            aria-label="Projectstatus"
          >
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
          <div className="flex-1" />
          <SaveIndicator state={saveState} />
          <IconButton label="Ongedaan maken (Ctrl+Z)" disabled={!canUndo} onClick={() => useEditor.getState().undo()}>
            <Undo2 size={17} />
          </IconButton>
          <IconButton label="Opnieuw (Ctrl+Shift+Z)" disabled={!canRedo} onClick={() => useEditor.getState().redo()}>
            <Redo2 size={17} />
          </IconButton>
        </div>
        <nav className="scrollbar-thin flex gap-1 overflow-x-auto px-3 sm:px-4" aria-label="Projectonderdelen">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => switchTab(t.id)}
              className={cx("whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1 text-[13px] font-medium transition", tab === t.id ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink")}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      <div className="min-h-0 flex-1">
        {tab === "overzicht" && <OverviewTab onOpenEditor={() => switchTab("ontwerp")} />}
        {tab === "ontwerp" && <DesignWorkspace view={view} setView={setViewMode} startCalibration={search.get("calibrate") === "1"} />}
        {tab === "analyse" && <AnalysisTab onOpenEditor={() => switchTab("ontwerp")} />}
        {tab === "staging" && <StagingTab />}
        {tab === "presentatie" && <PresentationTab />}
      </div>
    </div>
  );
}

function ProjectName() {
  const name = useEditor((s) => s.project!.name);
  const [editing, setEditing] = useState(false);
  if (!editing)
    return (
      <button onClick={() => setEditing(true)} className="max-w-[40vw] truncate rounded-md px-1.5 py-1 text-[15px] font-semibold hover:bg-stone-100" title="Klik om te hernoemen">
        {name}
      </button>
    );
  return (
    <input
      autoFocus
      defaultValue={name}
      className="w-64 rounded-md border border-accent px-2 py-1 text-[15px] font-semibold outline-none"
      onBlur={(e) => {
        const v = e.target.value.trim();
        if (v && v !== name) useEditor.getState().update((d) => void (d.name = v), { history: false });
        setEditing(false);
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setEditing(false);
      }}
      aria-label="Projectnaam"
    />
  );
}

function SaveIndicator({ state }: { state: "saved" | "saving" | "pending" | "error" }) {
  const map = {
    saved: { icon: <Check size={14} />, text: "Opgeslagen", cls: "text-muted" },
    pending: { icon: <Loader2 size={14} className="animate-spin" />, text: "Wijzigingen…", cls: "text-muted" },
    saving: { icon: <Loader2 size={14} className="animate-spin" />, text: "Opslaan…", cls: "text-muted" },
    error: { icon: <CloudOff size={14} />, text: "Opslaan mislukt", cls: "text-red-700" },
  }[state];
  return (
    <span className={cx("hidden items-center gap-1.5 text-xs sm:flex", map.cls)} data-testid="save-state" data-state={state}>
      {map.icon}
      {map.text}
    </span>
  );
}

