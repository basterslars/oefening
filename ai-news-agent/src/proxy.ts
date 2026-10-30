import { NextResponse, type NextRequest } from "next/server";

// Optionele wachtwoordbeveiliging (HTTP Basic Auth) voor zodra de app online
// staat. Actief als DASHBOARD_PASSWORD is gezet. /api/cron heeft een eigen geheim.
export function proxy(request: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD?.trim();
  if (!password || request.nextUrl.pathname.startsWith("/api/cron")) return NextResponse.next();

  const header = request.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    const decoded = atob(header.slice(6));
    const given = decoded.slice(decoded.indexOf(":") + 1);
    if (given === password) return NextResponse.next();
  }
  return new NextResponse("Inloggen vereist", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="AI News Agent", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
