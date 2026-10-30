"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bookmark, Lightbulb, LayoutDashboard, Newspaper, Settings } from "lucide-react";

const LINKS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/newsletter", label: "Nieuwsbrief", icon: Newspaper },
  { href: "/opportunities", label: "Kansen", icon: Lightbulb },
  { href: "/saved", label: "Opgeslagen", icon: Bookmark },
  { href: "/settings", label: "Instellingen", icon: Settings },
];

export function Nav() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-1 overflow-x-auto px-4 py-3 sm:px-6">
        <Link href="/" className="mr-4 shrink-0 font-semibold tracking-tight">
          AI News<span className="text-accent"> Agent</span>
        </Link>
        {LINKS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition ${
                active ? "bg-accent-soft text-accent" : "text-muted hover:text-ink"
              }`}
            >
              <Icon size={15} aria-hidden />
              <span className="hidden sm:inline">{label}</span>
            </Link>
          );
        })}
      </div>
    </header>
  );
}
