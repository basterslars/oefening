"use client";

import { Copy, FileUp, Home, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Badge, Button, Card, Input, Modal, Notice, Select, cx } from "@/components/ui";
import { formatArea } from "@/lib/geometry";
import { duplicateProject, getRepository, importBundle } from "@/lib/storage";
import { PROPERTY_TYPE_LABELS, STATUS_LABELS, type ProjectMeta, type ProjectStatus, type PropertyType } from "@/lib/types";

const STATUS_TONE: Record<ProjectStatus, "neutral" | "accent" | "ok" | "ai"> = {
  concept: "neutral",
  in_bewerking: "accent",
  gereed: "ok",
  gepresenteerd: "ai",
};

function relTime(iso: string) {
  const d = (Date.now() - Date.parse(iso)) / 1000;
  if (d < 60) return "zojuist";
  if (d < 3600) return `${Math.floor(d / 60)} min geleden`;
  if (d < 86400) return `${Math.floor(d / 3600)} uur geleden`;
  if (d < 86400 * 7) return `${Math.floor(d / 86400)} dagen geleden`;
  return new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
}

export default function Dashboard() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<ProjectStatus | "">("");
  const [type, setType] = useState<PropertyType | "">("");
  const [sort, setSort] = useState<"updated" | "name" | "created">("updated");
  const [renaming, setRenaming] = useState<ProjectMeta | null>(null);
  const [deleting, setDeleting] = useState<ProjectMeta | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      setProjects(await getRepository().list());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setProjects([]);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data laden bij mount
    refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const list = (projects ?? []).filter((p) => {
      const needle = q.trim().toLowerCase();
      if (needle && !`${p.name} ${p.address}`.toLowerCase().includes(needle)) return false;
      if (status && p.status !== status) return false;
      if (type && p.propertyType !== type) return false;
      return true;
    });
    return [...list].sort((a, b) =>
      sort === "name" ? a.name.localeCompare(b.name, "nl") : sort === "created" ? b.createdAt.localeCompare(a.createdAt) : b.updatedAt.localeCompare(a.updatedAt),
    );
  }, [projects, q, status, type, sort]);

  const recent = useMemo(() => [...(projects ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 4), [projects]);

  async function onDuplicate(p: ProjectMeta) {
    try {
      await duplicateProject(p.id);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function onImport(file: File) {
    try {
      const p = await importBundle(file);
      router.push(`/projects/${p.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">Vastgoedprojecten</h1>
            <p className="mt-1 text-sm text-muted">Reconstrueer woningen, richt ze virtueel in en maak presentaties voor kopers en huurders.</p>
          </div>
          <div className="flex gap-2">
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
            <Button icon={<FileUp size={16} />} onClick={() => fileRef.current?.click()}>
              Importeren
            </Button>
            <Link href="/projects/new">
              <Button variant="primary" icon={<Plus size={16} />}>
                Nieuwe woning
              </Button>
            </Link>
          </div>
        </div>

        {error && (
          <Notice tone="error" className="mt-6">
            {error}
          </Notice>
        )}

        {projects && projects.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-muted">Recent bewerkt</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {recent.map((p) => (
                <Link key={p.id} href={`/projects/${p.id}`} className="flex items-center gap-3 rounded-xl border border-line bg-white p-3 shadow-soft transition hover:shadow-lift">
                  <Thumb p={p} className="h-12 w-16 shrink-0 rounded-lg" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{p.name}</div>
                    <div className="text-xs text-muted">{relTime(p.updatedAt)}</div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="mt-10">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative min-w-56 flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <Input placeholder="Zoek op naam of adres…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" aria-label="Zoeken" />
            </div>
            <Select value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus | "")} className="w-auto" aria-label="Filter op status">
              <option value="">Alle statussen</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
            <Select value={type} onChange={(e) => setType(e.target.value as PropertyType | "")} className="w-auto" aria-label="Filter op type woning">
              <option value="">Alle woningtypes</option>
              {Object.entries(PROPERTY_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
            <Select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="w-auto" aria-label="Sorteren">
              <option value="updated">Laatst bewerkt</option>
              <option value="created">Nieuwste eerst</option>
              <option value="name">Naam (A–Z)</option>
            </Select>
          </div>

          {projects === null ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-72 animate-pulse rounded-2xl bg-stone-200/60" />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <EmptyState />
          ) : filtered.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted">Geen projecten gevonden met deze filters.</p>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((p) => (
                <ProjectCard key={p.id} p={p} onRename={() => setRenaming(p)} onDuplicate={() => onDuplicate(p)} onDelete={() => setDeleting(p)} />
              ))}
            </div>
          )}
        </section>
      </main>

      <RenameModal
        project={renaming}
        onClose={() => setRenaming(null)}
        onSave={async (name) => {
          if (!renaming) return;
          const full = await getRepository().get(renaming.id);
          if (full) await getRepository().save({ ...full, name, updatedAt: new Date().toISOString() });
          setRenaming(null);
          refresh();
        }}
      />
      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Project verwijderen"
        footer={
          <>
            <Button onClick={() => setDeleting(null)}>Annuleren</Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (deleting) await getRepository().remove(deleting.id);
                setDeleting(null);
                refresh();
              }}
            >
              Definitief verwijderen
            </Button>
          </>
        }
      >
        <p className="text-sm">
          Weet u zeker dat u <strong>{deleting?.name}</strong> wilt verwijderen? Plattegronden, ontwerpvarianten, foto&apos;s en visualisaties worden ook verwijderd. Dit kan niet ongedaan worden gemaakt.
        </p>
      </Modal>
    </div>
  );
}

function Thumb({ p, className }: { p: ProjectMeta; className?: string }) {
  return p.thumbnail ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={p.thumbnail} alt="" className={cx("object-cover", className)} />
  ) : (
    <div className={cx("flex items-center justify-center bg-gradient-to-br from-stone-100 to-stone-200 text-stone-400", className)}>
      <Home size={22} strokeWidth={1.5} />
    </div>
  );
}

function ProjectCard({ p, onRename, onDuplicate, onDelete }: { p: ProjectMeta; onRename(): void; onDuplicate(): void; onDelete(): void }) {
  const [menu, setMenu] = useState(false);
  return (
    <Card className="group relative overflow-hidden transition hover:shadow-lift">
      <Link href={`/projects/${p.id}`} className="block">
        <Thumb p={p} className="aspect-[16/10] w-full" />
        <div className="p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate font-medium">{p.name}</h3>
            <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABELS[p.status]}</Badge>
          </div>
          <p className="mt-0.5 truncate text-[13px] text-muted">{p.address || "Geen adres ingevoerd"}</p>
          <div className="mt-3 flex items-center gap-3 text-xs text-muted">
            <span>{PROPERTY_TYPE_LABELS[p.propertyType]}</span>
            {p.totalArea && <span>· {formatArea(p.totalArea.value)}</span>}
            <span className="ml-auto">{relTime(p.updatedAt)}</span>
          </div>
        </div>
      </Link>
      <div className="absolute right-2 top-2">
        <button
          onClick={() => setMenu((m) => !m)}
          className="rounded-lg bg-white/90 p-1.5 text-ink shadow-sm backdrop-blur hover:bg-white"
          aria-label={`Acties voor ${p.name}`}
        >
          <MoreHorizontal size={16} />
        </button>
        {menu && (
          <div className="absolute right-0 z-10 mt-1 w-44 overflow-hidden rounded-xl border border-line bg-white py-1 text-sm shadow-lift" onMouseLeave={() => setMenu(false)}>
            <MenuItem icon={<Pencil size={14} />} onClick={() => (setMenu(false), onRename())}>
              Hernoemen
            </MenuItem>
            <MenuItem icon={<Copy size={14} />} onClick={() => (setMenu(false), onDuplicate())}>
              Dupliceren
            </MenuItem>
            <MenuItem icon={<Trash2 size={14} />} danger onClick={() => (setMenu(false), onDelete())}>
              Verwijderen
            </MenuItem>
          </div>
        )}
      </div>
    </Card>
  );
}

function MenuItem({ icon, children, onClick, danger }: { icon: React.ReactNode; children: React.ReactNode; onClick(): void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={cx("flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-stone-50", danger && "text-red-700")}>
      {icon}
      {children}
    </button>
  );
}

function RenameModal({ project, onClose, onSave }: { project: ProjectMeta | null; onClose(): void; onSave(name: string): void }) {
  return (
    <Modal open={!!project} onClose={onClose} title="Project hernoemen">
      {project && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
            if (name) onSave(name);
          }}
        >
          <Input name="name" defaultValue={project.name} autoFocus aria-label="Projectnaam" />
          <div className="mt-4 flex justify-end gap-2">
            <Button onClick={onClose}>Annuleren</Button>
            <Button variant="primary" type="submit">
              Opslaan
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-stone-300 bg-white/60 px-6 py-20 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
        <Home size={26} strokeWidth={1.6} />
      </div>
      <h3 className="mt-4 text-lg font-semibold">Nog geen woningen</h3>
      <p className="mt-1 max-w-md text-sm text-muted">
        Voeg een woning toe met een plattegrond, door zelf te tekenen of met behulp van foto&apos;s. Daarna kunt u de woning in 3D bekijken en virtueel inrichten.
      </p>
      <Link href="/projects/new" className="mt-6">
        <Button variant="primary" icon={<Plus size={16} />}>
          Eerste woning toevoegen
        </Button>
      </Link>
    </div>
  );
}
