import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Ververst de Supabase-sessie bij elk verzoek en stuurt niet-ingelogde
// bezoekers naar /login. API-routes controleren de gebruiker zelf opnieuw.
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const path = request.nextUrl.pathname;
  const isPublic = path.startsWith("/login") || path.startsWith("/auth") || path.startsWith("/setup");
  if (!url || !key) {
    if (isPublic || path.startsWith("/api")) return NextResponse.next();
    return NextResponse.redirect(new URL("/setup", request.url));
  }
  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user && !isPublic && !path.startsWith("/api")) {
    const to = new URL("/login", request.url);
    if (path !== "/") to.searchParams.set("next", path + request.nextUrl.search);
    return NextResponse.redirect(to);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|jpg|svg|webp|ico)$).*)"],
};
