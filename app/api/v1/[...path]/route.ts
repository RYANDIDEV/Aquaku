import type { NextRequest } from "next/server";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

const METHODS = ["GET", "POST", "PATCH", "DELETE"] as const;
const FORWARDED_REQUEST_HEADERS = ["accept", "authorization", "content-type"] as const;

async function proxyRequest(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;

  if (!path.length || path.some((segment) => segment === "." || segment === ".." || !/^[\w.-]+$/.test(segment))) {
    return Response.json(
      { error: { code: "INVALID_API_PATH", message: "Path API tidak valid." } },
      { status: 400 },
    );
  }

  let upstreamUrl: URL;
  try {
    const baseUrl = process.env.AQUAKU_API_BASE_URL ?? "http://localhost:3000/api/v1";
    upstreamUrl = new URL(baseUrl);
    if (upstreamUrl.protocol !== "http:" && upstreamUrl.protocol !== "https:") {
      throw new Error("AQUAKU_API_BASE_URL harus menggunakan HTTP atau HTTPS.");
    }
    upstreamUrl.pathname = `${upstreamUrl.pathname.replace(/\/+$/, "")}/${path.map(encodeURIComponent).join("/")}`;
    upstreamUrl.search = request.nextUrl.search;
  } catch (error) {
    console.error("Invalid Aquaku API base URL:", error);
    return Response.json(
      { error: { code: "API_CONFIGURATION_ERROR", message: "Konfigurasi backend API tidak valid." } },
      { status: 500 },
    );
  }

  const headers = new Headers();
  for (const headerName of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(headerName);
    if (value) headers.set(headerName, value);
  }

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body: request.method === "GET" ? undefined : await request.arrayBuffer(),
      cache: "no-store",
      redirect: "manual",
    });
    const responseHeaders = new Headers();
    const contentType = upstreamResponse.headers.get("content-type");
    const retryAfter = upstreamResponse.headers.get("retry-after");

    if (contentType) responseHeaders.set("content-type", contentType);
    if (retryAfter) responseHeaders.set("retry-after", retryAfter);
    responseHeaders.set("cache-control", "no-store");

    return new Response(
      upstreamResponse.status === 204 || upstreamResponse.status === 304 ? null : upstreamResponse.body,
      { status: upstreamResponse.status, headers: responseHeaders },
    );
  } catch (error) {
    console.error(`Aquaku backend request failed (${request.method} ${upstreamUrl.pathname}):`, error);
    return Response.json(
      { error: { code: "API_UNAVAILABLE", message: "Backend tidak dapat dihubungi. Periksa apakah server API aktif." } },
      { status: 502 },
    );
  }
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
