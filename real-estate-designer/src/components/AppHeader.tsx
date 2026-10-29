"use client";

import { Cloud, HardDrive, LogOut } from "lucide-react";
import Link from "next/link";
import { useAuth } from "./AuthProvider";
import { Badge } from "./ui";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M3 11.5 12 4l9 7.5" />
          <path d="M5.5 10v9.5h13V10" />
          <path d="M10 19.5v-5h4v5" />
        </svg>
      </span>
      <span className="text-[15px] font-semibold tracking-tight">
        Real Estate <span className="text-bronze">Designer</span>
      </span>
    </Link>
  );
}

export function AppHeader({ children }: { children?: React.ReactNode }) {
  const { mode, session, signOut } = useAuth();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Logo />
        <div className="flex-1">{children}</div>
        {mode === "local" ? (
          <span title="Projecten worden opgeslagen in deze browser (IndexedDB). Configureer Supabase voor accounts, cloudopslag en deellinks.">
            <Badge>
              <HardDrive size={12} /> Lokale opslag
            </Badge>
          </span>
        ) : (
          <div className="flex items-center gap-2">
            <Badge tone="accent">
              <Cloud size={12} /> {session?.user.email}
            </Badge>
            <button onClick={signOut} className="rounded-lg p-2 text-muted hover:bg-stone-100 hover:text-ink" title="Uitloggen" aria-label="Uitloggen">
              <LogOut size={16} />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
