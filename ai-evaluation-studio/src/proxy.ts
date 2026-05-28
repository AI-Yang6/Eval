import { NextResponse, type NextRequest } from "next/server";

import {
  ACCESS_COOKIE_NAME,
  ACCESS_COOKIE_VALUE,
  isAccessControlEnabled,
} from "@/lib/server/access-control";

const PUBLIC_FILE = /\.(.*)$/;
const PUBLIC_PATHS = new Set(["/access", "/privacy"]);
const PUBLIC_API_PATHS = new Set(["/api/access"]);

export function proxy(req: NextRequest) {
  if (!isAccessControlEnabled()) {
    return NextResponse.next();
  }

  const { pathname } = req.nextUrl;
  if (
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    PUBLIC_FILE.test(pathname) ||
    PUBLIC_PATHS.has(pathname) ||
    PUBLIC_API_PATHS.has(pathname)
  ) {
    return NextResponse.next();
  }

  const hasAccess =
    req.cookies.get(ACCESS_COOKIE_NAME)?.value === ACCESS_COOKIE_VALUE;
  if (hasAccess) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { ok: false, error: "需要访问码" },
      {
        status: 401,
        headers: {
          "Cache-Control": "no-store, max-age=0",
          Pragma: "no-cache",
        },
      }
    );
  }

  const url = req.nextUrl.clone();
  url.pathname = "/access";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
