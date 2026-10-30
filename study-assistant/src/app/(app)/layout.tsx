import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  return <AppShell email={user.email ?? ""}>{children}</AppShell>;
}
