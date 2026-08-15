import { setDefaultResultOrder } from "node:dns";
import { NextRequest } from "next/server";

setDefaultResultOrder("verbatim");

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

function apiOrigin() {
  const raw = (process.env.API_ORIGIN ?? "http://localhost:3001").replace(
    /\/$/,
    "",
  );
  try {
    const url = new URL(raw);
    if (!url.port) url.port = process.env.API_PORT ?? "3001";
    return url.origin;
  } catch {
    return raw;
  }
}

function fail(target: string, reason: string) {
  const origin = apiOrigin();
  return Response.json(
    {
      message: `Cannot connect to API at ${origin}. ${reason}`,
      origin,
      target,
      reason,
    },
    { status: 502 },
  );
}

async function proxy(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const { path } = await ctx.params;
  const origin = apiOrigin();
  const target = `${origin}/${path.join("/")}${req.nextUrl.search}`;
  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!HOP.has(key.toLowerCase())) headers.set(key, value);
  });
  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: "manual",
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.arrayBuffer();
  }
  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    return fail(target, reason);
  }
  const out = new Headers();
  upstream.headers.forEach((value, key) => {
    if (HOP.has(key.toLowerCase())) return;
    if (key.toLowerCase() === "set-cookie") return;
    out.set(key, value);
  });
  const cookies =
    typeof upstream.headers.getSetCookie === "function"
      ? upstream.headers.getSetCookie()
      : [];
  for (const cookie of cookies) out.append("set-cookie", cookie);
  return new Response(upstream.body, {
    status: upstream.status,
    headers: out,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
