import { open, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import { devStoragePath, verifyDevLink } from "@/lib/storage";

// The local stand-in for R2's signed links, used when no R2 keys are set: in development, and in
// the desktop app (ALLCON_LOCAL=1), where it's the only storage. Answers Range requests (PDFs).

const keyOf = async (ctx: RouteContext<"/api/dev-storage/[...key]">) => (await ctx.params).key.join("/");
const disabled = () => process.env.NODE_ENV === "production" && process.env.ALLCON_LOCAL !== "1";

const contentType = (key: string) =>
  key.endsWith(".ifc.gz") || key.endsWith(".ifc")
    ? "application/x-step"
    : key.toLowerCase().endsWith(".pdf")
      ? "application/pdf"
      : "application/octet-stream";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/dev-storage/[...key]">) {
  const key = await keyOf(ctx);
  if (disabled() || !verifyDevLink(key, request.nextUrl.searchParams, "get")) return new Response("Forbidden", { status: 403 });
  const file = devStoragePath(key);
  try {
    const { size } = await stat(file);
    const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.get("range") ?? "");
    if (range) {
      const start = Number(range[1]);
      const end = Math.min(range[2] ? Number(range[2]) : size - 1, size - 1);
      if (start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
      const handle = await open(file, "r");
      try {
        const buf = new Uint8Array(end - start + 1);
        await handle.read(buf, 0, buf.length, start);
        return new Response(buf, {
          status: 206,
          headers: {
            "Content-Type": contentType(key),
            "Content-Range": `bytes ${start}-${end}/${size}`,
            "Content-Length": String(buf.length),
            "Accept-Ranges": "bytes",
            "Cache-Control": "private, no-store",
          },
        });
      } finally {
        await handle.close();
      }
    }
    const body = await readFile(file);
    const gz = body[0] === 0x1f && body[1] === 0x8b;
    const dl = request.nextUrl.searchParams.get("dl");
    return new Response(body, {
      headers: {
        "Content-Type": contentType(key),
        "Accept-Ranges": "bytes",
        ...(gz ? { "Content-Encoding": "gzip" } : {}),
        ...(dl ? { "Content-Disposition": dl } : {}),
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/dev-storage/[...key]">) {
  const key = await keyOf(ctx);
  if (disabled() || !verifyDevLink(key, request.nextUrl.searchParams, "put")) return new Response("Forbidden", { status: 403 });
  const file = devStoragePath(key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, new Uint8Array(await request.arrayBuffer()));
  return new Response(null, { status: 200 });
}
