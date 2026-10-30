"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  Compass,
  GraduationCap,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  Settings,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/courses", label: "Vakken", icon: BookOpen },
  { href: "/tutor", label: "AI-docent", icon: MessageSquareText },
  { href: "/exams", label: "Oefententamens", icon: ClipboardCheck },
  { href: "/flashcards", label: "Flashcards", icon: Layers },
  { href: "/planner", label: "Planner", icon: CalendarDays },
  { href: "/progress", label: "Voortgang", icon: BarChart3 },
  { href: "/coach", label: "Studiecoach", icon: Compass },
];

const MOBILE = [NAV[0], NAV[1], NAV[2], NAV[3], NAV[4]];

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

export function AppShell({ email, children }: { email: string; children: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const navLinks = (onClick?: () => void) =>
    NAV.map(({ href, label, icon: Icon }) => (
      <Link
        key={href}
        href={href}
        onClick={onClick}
        className={cn(
          "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
          isActive(path, href) ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <Icon className="size-4" />
        {label}
      </Link>
    ));
  const footer = (onClick?: () => void) => (
    <div className="mt-auto space-y-1 border-t border-border pt-3">
      <Link href="/settings" onClick={onClick} className={cn("flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm", isActive(path, "/settings") ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted")}>
        <Settings className="size-4" /> Instellingen
      </Link>
      <form action="/auth/signout" method="post">
        <button className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted-foreground hover:bg-muted">
          <LogOut className="size-4" /> Uitloggen
        </button>
      </form>
      <p className="truncate px-2.5 pt-1 text-xs text-muted-foreground" title={email}>
        {email}
      </p>
    </div>
  );
  return (
    <div className="min-h-dvh lg:pl-60">
      {/* Desktop-zijbalk */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-border bg-card px-3 py-4 lg:flex">
        <Link href="/" className="mb-5 flex items-center gap-2 px-2.5 font-semibold tracking-tight">
          <GraduationCap className="size-5 text-primary" /> Studieassistent
        </Link>
        <nav className="space-y-0.5">{navLinks()}</nav>
        {footer()}
      </aside>

      {/* Mobiele kopbalk */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur lg:hidden">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <GraduationCap className="size-5 text-primary" /> Studieassistent
        </Link>
        <button aria-label="Menu" className="rounded-lg p-2 hover:bg-muted" onClick={() => setOpen(true)}>
          <Menu className="size-5" />
        </button>
      </header>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal>
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 right-0 flex w-72 max-w-[85%] flex-col bg-card px-3 py-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between px-2.5">
              <span className="font-semibold">Menu</span>
              <button aria-label="Sluiten" className="rounded-lg p-1.5 hover:bg-muted" onClick={() => setOpen(false)}>
                <X className="size-5" />
              </button>
            </div>
            <nav className="space-y-0.5">{navLinks(() => setOpen(false))}</nav>
            {footer(() => setOpen(false))}
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-5 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">{children}</main>

      {/* Mobiele tabbalk met de belangrijkste acties */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {MOBILE.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={cn("flex flex-col items-center gap-0.5 py-2 text-[10px]", isActive(path, href) ? "text-primary" : "text-muted-foreground")}>
            <Icon className="size-5" />
            <span className="truncate">{label === "Oefententamens" ? "Tentamens" : label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
