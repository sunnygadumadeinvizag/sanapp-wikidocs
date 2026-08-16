import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  md: "text/markdown",
  pdf: "application/pdf",
  txt: "text/plain",
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;
  const name = segments.join("/");
  // Only a single stored filename is allowed — no nesting, no traversal.
  if (!name || name.includes("..") || name.includes("/") || name.includes("\\")) {
    return new NextResponse("Not found", { status: 404 });
  }
  const full = path.join(UPLOADS_DIR, name);
  if (!full.startsWith(UPLOADS_DIR)) {
    return new NextResponse("Not found", { status: 404 });
  }
  try {
    const data = await readFile(full);
    const ext = path.extname(name).slice(1).toLowerCase();
    return new NextResponse(data, {
      headers: {
        "content-type": MIME[ext] ?? "application/octet-stream",
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
