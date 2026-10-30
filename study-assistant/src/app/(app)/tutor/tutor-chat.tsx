"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, BookOpenCheck, FileText, GraduationCap, History, Lightbulb, Plus, Square, Trash2, Zap } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { ChatMessage, ChatSession, Course, SourceRef, TutorMode } from "@/lib/types";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/form";
import { Alert, Badge, Spinner } from "@/components/ui/misc";
import { cn, formatDate } from "@/lib/utils";

const MODES: { id: TutorMode; label: string; icon: typeof Lightbulb; hint: string }[] = [
  { id: "explain", label: "Uitleg", icon: Lightbulb, hint: "Socratisch: de docent laat je eerst zelf nadenken" },
  { id: "exam", label: "Tentamen", icon: GraduationCap, hint: "De docent stelt tentamenvragen en kijkt na" },
  { id: "practice", label: "Oefenen", icon: BookOpenCheck, hint: "Opgaven met hints en uitwerkingen" },
  { id: "quick", label: "Snelle vraag", icon: Zap, hint: "Kort en direct antwoord" },
];

interface Msg {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: SourceRef[];
  pending?: boolean;
}

function Sources({ sources }: { sources: SourceRef[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!sources.length) return null;
  const current = sources.find((s) => s.label === open);
  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-1.5">
        {sources.map((s) => (
          <button
            key={s.id}
            onClick={() => setOpen(open === s.label ? null : (s.label ?? null))}
            className={cn("inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px]", open === s.label ? "border-primary bg-accent text-accent-foreground" : "border-border text-muted-foreground hover:bg-muted")}
          >
            <FileText className="size-3 shrink-0" />
            <span className="font-medium">{s.label}</span>
            <span className="truncate">
              {s.document_name}
              {s.location ? `, ${s.location}` : ""}
            </span>
          </button>
        ))}
      </div>
      {current?.excerpt && <p className="mt-2 rounded-md bg-muted/70 px-3 py-2 text-xs text-muted-foreground">“{current.excerpt}…”</p>}
    </div>
  );
}

export function TutorChat(props: {
  aiEnabled: boolean;
  courses: Pick<Course, "id" | "name" | "color">[];
  sessions: ChatSession[];
  session: ChatSession | null;
  initialMessages: ChatMessage[];
  initialCourseId: string | null;
  initialMode: TutorMode;
  initialInput: string;
}) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(props.session?.id ?? null);
  const [courseId, setCourseId] = useState<string | null>(props.initialCourseId);
  const [mode, setMode] = useState<TutorMode>(props.initialMode);
  const [messages, setMessages] = useState<Msg[]>(props.initialMessages.map((m) => ({ id: m.id, role: m.role, content: m.content, sources: m.sources ?? [] })));
  const [input, setInput] = useState(props.initialInput);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  async function send(text?: string) {
    const message = (text ?? input).trim();
    if (!message || busy) return;
    setInput("");
    setError(null);
    setBusy(true);
    const userMsg: Msg = { id: crypto.randomUUID(), role: "user", content: message, sources: [] };
    const botId = crypto.randomUUID();
    setMessages((m) => [...m, userMsg, { id: botId, role: "assistant", content: "", sources: [], pending: true }]);
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      const res = await fetch("/api/tutor/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, courseId, mode, message }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? `Fout ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const ev = JSON.parse(line);
          if (ev.type === "meta") {
            if (!sessionId) {
              setSessionId(ev.sessionId);
              window.history.replaceState(null, "", `/tutor?session=${ev.sessionId}`);
            }
            setMessages((m) => m.map((x) => (x.id === botId ? { ...x, sources: ev.sources } : x)));
          } else if (ev.type === "text") {
            setMessages((m) => m.map((x) => (x.id === botId ? { ...x, content: x.content + ev.text } : x)));
          } else if (ev.type === "error") {
            setError(ev.error);
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      setMessages((m) => m.filter((x) => !(x.id === botId && !x.content)).map((x) => (x.id === botId ? { ...x, pending: false } : x)));
      setBusy(false);
      abort.current = null;
      router.refresh();
    }
  }

  async function deleteSession(id: string) {
    if (!confirm("Dit gesprek verwijderen?")) return;
    await supabaseBrowser().from("chat_sessions").delete().eq("id", id);
    if (id === sessionId) router.push("/tutor");
    router.refresh();
  }

  const courseName = (id: string | null) => props.courses.find((c) => c.id === id)?.name ?? "Alle vakken";
  const history = (
    <div className="space-y-0.5">
      <Link href="/tutor" className="mb-2 flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted">
        <Plus className="size-4" /> Nieuw gesprek
      </Link>
      {props.sessions.length === 0 && <p className="px-2 text-xs text-muted-foreground">Nog geen gesprekken.</p>}
      {props.sessions.map((s) => (
        <div key={s.id} className={cn("group flex items-center gap-1 rounded-lg", s.id === sessionId ? "bg-accent" : "hover:bg-muted")}>
          <Link href={`/tutor?session=${s.id}`} className="min-w-0 flex-1 px-2.5 py-2">
            <p className="truncate text-sm">{s.title}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {courseName(s.course_id)} · {formatDate(s.updated_at)}
            </p>
          </Link>
          <button aria-label="Verwijderen" onClick={() => deleteSession(s.id)} className="mr-1 rounded p-1 text-muted-foreground opacity-0 hover:text-danger group-hover:opacity-100 focus:opacity-100">
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex h-[calc(100dvh-9.5rem)] gap-6 lg:h-[calc(100dvh-4.5rem)]">
      <aside className="hidden w-64 shrink-0 overflow-y-auto lg:block">{history}</aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
          <Select
            aria-label="Vak"
            className="w-auto max-w-[12rem]"
            value={courseId ?? ""}
            disabled={!!sessionId}
            onChange={(e) => setCourseId(e.target.value || null)}
            title={sessionId ? "Het vak ligt vast binnen een gesprek" : undefined}
          >
            <option value="">Alle vakken</option>
            {props.courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <div className="flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
            {MODES.map((m) => (
              <button
                key={m.id}
                title={m.hint}
                onClick={() => setMode(m.id)}
                className={cn("flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium", mode === m.id ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground")}
              >
                <m.icon className="size-3.5" />
                {m.label}
              </button>
            ))}
          </div>
          <button className="ml-auto rounded-lg p-2 text-muted-foreground hover:bg-muted lg:hidden" aria-label="Gesprekken" onClick={() => setShowHistory(!showHistory)}>
            <History className="size-4" />
          </button>
        </div>
        {showHistory && <div className="max-h-72 overflow-y-auto border-b border-border py-3 lg:hidden">{history}</div>}

        <div className="flex-1 overflow-y-auto py-5">
          {!props.aiEnabled && (
            <Alert tone="warning" title="AI is niet geconfigureerd" className="mb-4">
              Zet ANTHROPIC_API_KEY in .env.local om de AI-docent te gebruiken. Zoeken in je materiaal werkt wel (Vakken → Kennisbank).
            </Alert>
          )}
          {messages.length === 0 ? (
            <div className="mx-auto max-w-lg pt-6 text-center">
              <GraduationCap className="mx-auto size-8 text-primary" />
              <p className="mt-3 font-medium">Waar wil je mee aan de slag?</p>
              <p className="mt-1 text-sm text-muted-foreground">{MODES.find((m) => m.id === mode)?.hint}. Antwoorden zijn gebaseerd op je eigen documenten{courseId ? ` van ${courseName(courseId)}` : ""}, met bronvermelding.</p>
              <div className="mt-5 grid gap-2 text-left sm:grid-cols-2">
                {(mode === "exam"
                  ? ["Stel me een tentamenvraag over de belangrijkste theorie", "Overhoor me over de begrippen uit het laatste hoofdstuk"]
                  : mode === "practice"
                    ? ["Geef me een rekenopgave op tentamenniveau", "Oefen met mij het onderwerp waar ik het zwakst in ben"]
                    : ["Leg het belangrijkste model uit dit vak stap voor stap uit", "Wat zijn de verbanden tussen de hoofdstukken?"]
                ).map((s) => (
                  <button key={s} onClick={() => send(s)} disabled={busy || !props.aiEnabled} className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted disabled:opacity-50">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-5">
              {messages.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className="flex justify-end">
                    <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground">{m.content}</div>
                  </div>
                ) : (
                  <div key={m.id} className="flex gap-3">
                    <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
                      <GraduationCap className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      {m.content ? <Markdown>{m.content}</Markdown> : <Spinner className="mt-1.5 text-muted-foreground" />}
                      {!m.pending && <Sources sources={m.sources} />}
                      {!m.pending && m.sources.length === 0 && m.content && <Badge className="mt-2">Geen bronfragmenten gevonden voor deze vraag</Badge>}
                    </div>
                  </div>
                ),
              )}
              <div ref={bottom} />
            </div>
          )}
        </div>

        {error && <Alert tone="danger" className="mb-2">{error}</Alert>}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="mx-auto flex w-full max-w-3xl items-end gap-2 rounded-xl border border-border bg-card p-2 shadow-sm"
        >
          <Textarea
            ref={textarea}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            maxLength={8000}
            placeholder={mode === "exam" ? "Typ je antwoord of vraag om een tentamenvraag…" : "Stel een vraag over je studiemateriaal…"}
            className="max-h-48 min-h-10 resize-none border-0 bg-transparent focus-visible:outline-none"
            disabled={!props.aiEnabled}
          />
          {busy ? (
            <Button type="button" size="icon" variant="secondary" aria-label="Stoppen" onClick={() => abort.current?.abort()}>
              <Square />
            </Button>
          ) : (
            <Button size="icon" aria-label="Versturen" disabled={!input.trim() || !props.aiEnabled}>
              <ArrowUp />
            </Button>
          )}
        </form>
        <p className="mx-auto mt-1.5 max-w-3xl text-center text-[11px] text-muted-foreground">AI kan fouten maken. Controleer belangrijke informatie in de genoemde bronnen.</p>
      </div>
    </div>
  );
}
