import { Suspense } from "react";
import { GraduationCap } from "lucide-react";
import { LoginForm } from "./login-form";

export const metadata = { title: "Inloggen" };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <GraduationCap className="mx-auto size-9 text-primary" />
          <h1 className="mt-3 text-xl font-semibold tracking-tight">Studieassistent</h1>
          <p className="mt-1 text-sm text-muted-foreground">Studeer met een AI-docent die je eigen studiemateriaal kent.</p>
        </div>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
