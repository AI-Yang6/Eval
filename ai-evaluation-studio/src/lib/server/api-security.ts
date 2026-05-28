import { NextResponse } from "next/server";

const DEFAULT_MAX_BODY_BYTES = 256 * 1024;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
};

export function jsonResponse<T>(
  body: T,
  init?: ResponseInit
): NextResponse<T> {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...NO_STORE_HEADERS,
      ...init?.headers,
    },
  });
}

export async function readJsonBody<T>(
  req: Request,
  maxBytes = DEFAULT_MAX_BODY_BYTES
): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  const declaredLength = req.headers.get("content-length");
  if (declaredLength && Number(declaredLength) > maxBytes) {
    return {
      ok: false,
      response: jsonResponse(
        { ok: false, error: `请求体过大，最大允许 ${formatBytes(maxBytes)}` },
        { status: 413 }
      ),
    };
  }

  let text: string;
  try {
    text = await req.text();
  } catch {
    return {
      ok: false,
      response: jsonResponse(
        { ok: false, error: "读取请求体失败" },
        { status: 400 }
      ),
    };
  }

  if (new TextEncoder().encode(text).length > maxBytes) {
    return {
      ok: false,
      response: jsonResponse(
        { ok: false, error: `请求体过大，最大允许 ${formatBytes(maxBytes)}` },
        { status: 413 }
      ),
    };
  }

  try {
    return { ok: true, data: JSON.parse(text) as T };
  } catch {
    return {
      ok: false,
      response: jsonResponse(
        { ok: false, error: "请求体不是合法 JSON" },
        { status: 400 }
      ),
    };
  }
}

export function checkRateLimit(
  req: Request,
  options: { limit: number; windowMs: number }
): NextResponse | null {
  const now = Date.now();
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const key = `${ip}:${new URL(req.url).pathname}`;
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return null;
  }
  if (bucket.count >= options.limit) {
    return jsonResponse(
      { ok: false, error: "请求过于频繁，请稍后再试" },
      { status: 429 }
    );
  }
  bucket.count++;
  return null;
}

export function sanitizeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/sk-[A-Za-z0-9._-]{8,}/gi, "sk-[REDACTED]")
    .replace(/sk-ant-[A-Za-z0-9._-]{8,}/gi, "sk-ant-[REDACTED]")
    .replace(/(api[_-]?key["'\s:=]+)[^"',\s}]+/gi, "$1[REDACTED]")
    .slice(0, 500);
}

export function sanitizeProviderError(text: string): string {
  return sanitizeErrorMessage(text).slice(0, 500);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${Math.round(bytes / 1024)} KB`;
}
