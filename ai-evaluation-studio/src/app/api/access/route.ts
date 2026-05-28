import { cookies } from "next/headers";

import {
  ACCESS_COOKIE_NAME,
  ACCESS_COOKIE_VALUE,
  isAccessControlEnabled,
  isValidAccessCode,
} from "@/lib/server/access-control";
import { jsonResponse, readJsonBody } from "@/lib/server/api-security";

export const dynamic = "force-dynamic";

interface AccessBody {
  code?: string;
}

export async function POST(req: Request) {
  if (!isAccessControlEnabled()) {
    return jsonResponse({ ok: true, enabled: false });
  }

  const parsed = await readJsonBody<AccessBody>(req, 16 * 1024);
  if (!parsed.ok) return parsed.response;

  if (!isValidAccessCode(parsed.data.code)) {
    return jsonResponse(
      { ok: false, error: "访问码不正确" },
      { status: 401 }
    );
  }

  const jar = await cookies();
  jar.set(ACCESS_COOKIE_NAME, ACCESS_COOKIE_VALUE, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return jsonResponse({ ok: true, enabled: true });
}

export async function DELETE() {
  const jar = await cookies();
  jar.delete(ACCESS_COOKIE_NAME);
  return jsonResponse({ ok: true });
}
