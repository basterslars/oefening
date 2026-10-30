import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { AiError } from "@/lib/ai/client";
import { supabaseServer } from "@/lib/supabase/server";

export class ApiError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/** Ingelogde gebruiker voor API-routes (sessie uit cookies, RLS actief). */
export async function apiUser() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new ApiError("Niet ingelogd.", 401);
  return { supabase, user };
}

export async function parseBody<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new ApiError("Ongeldige JSON.", 400);
  }
  const r = schema.safeParse(json);
  if (!r.success) throw new ApiError(`Ongeldige invoer: ${r.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`, 400);
  return r.data;
}

export function errorResponse(e: unknown) {
  if (e instanceof ApiError || e instanceof AiError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error(e);
  return NextResponse.json({ error: "Er ging iets mis op de server." }, { status: 500 });
}

/** Wikkelt een route-handler met uniforme foutafhandeling. */
export function route<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function must<T>(r: { data: T; error: { message: string } | null }, what: string): NonNullable<T> {
  if (r.error) throw new ApiError(`${what}: ${r.error.message}`, 500);
  if (r.data === null) throw new ApiError(`${what} niet gevonden.`, 404);
  return r.data as NonNullable<T>;
}
