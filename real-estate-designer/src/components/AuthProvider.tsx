"use client";

import type { Session } from "@supabase/supabase-js";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";

interface AuthState {
  mode: "local" | "cloud";
  session: Session | null;
  ready: boolean;
  signOut(): Promise<void>;
}

const Ctx = createContext<AuthState>({ mode: "local", session: null, ready: false, signOut: async () => {} });

export const useAuth = () => useContext(Ctx);

const PUBLIC_PATHS = ["/login", "/share"];

/**
 * In cloudmodus (Supabase geconfigureerd) is inloggen verplicht en worden
 * niet-ingelogde gebruikers naar /login gestuurd. In lokale modus is er geen
 * account nodig.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const sb = getSupabase();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!sb);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!sb) return;
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, [sb]);

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  useEffect(() => {
    if (sb && ready && !session && !isPublic) router.replace("/login");
  }, [sb, ready, session, isPublic, router]);

  const value: AuthState = {
    mode: sb ? "cloud" : "local",
    session,
    ready,
    signOut: async () => {
      await sb?.auth.signOut();
      router.replace("/login");
    },
  };

  if (sb && !isPublic && (!ready || !session)) {
    return (
      <Ctx.Provider value={value}>
        <div className="flex min-h-screen items-center justify-center text-sm text-stone-500">Bezig met laden…</div>
      </Ctx.Provider>
    );
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
