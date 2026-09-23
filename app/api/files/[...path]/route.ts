import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyAppSession } from "@/lib/session";
import { canViewPage, currentViewer } from "@/lib/wiki";

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
  csv: "text/csv",
  json: "application/json",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  zip: "application/zip",
};

/**
 * A file may only be fetched when the request comes from inside a wiki
 * document (or editor), not when someone pastes / bookmarks the raw URL.
 *
 * - Direct address-bar / saved-link open → Sec-Fetch-Site: none → deny.
 * - Click from a wiki page → Sec-Fetch-Site: same-origin (+ Referer) → allow.
 * - Hotlink from another site → Sec-Fetch-Site: cross-site → deny.
 * - Clients without Sec-Fetch (curl, old browsers) need a wiki Referer.
 */
function isFromWikiDocument(request: NextRequest): boolean {
  const site = (request.headers.get("sec-fetch-site") ?? "").toLowerCase();
  const referer = request.headers.get("referer");

  // Pasted/bookmarked URL opened on its own — not a click from a page.
  if (site === "none") return false;
  // Embedded or navigated from a different origin.
  if (site === "cross-site") return false;

  if (site === "same-origin" || site === "same-site") {
    // Same-origin is enough (wiki page → wiki file). If a Referer is present
    // it must still be this host (defence in depth behind the proxy).
    if (referer) {
      try {
        const r = new URL(referer);
        const host = request.headers.get("host") ?? request.nextUrl.host;
        if (r.host && host && r.host !== host && !host.endsWith(r.host) && !r.host.endsWith(host)) {
          // Allow when Apache terminates TLS and app sees an internal host.
          const pathOk =
            r.pathname.includes("/docs/") ||
            r.pathname.includes("/pages/") ||
            r.pathname.includes("/admin") ||
            r.pathname.endsWith("/wikidocs/") ||
            r.pathname.endsWith("/wikidocs");
          if (!pathOk) return false;
        }
      } catch {
        return false;
      }
    }
    return true;
  }

  // No Sec-Fetch headers: only accept an explicit wiki-page Referer.
  if (!referer) return false;
  try {
    const r = new URL(referer);
    const p = r.pathname;
    return (
      p.includes("/docs/") ||
      p.includes("/pages/") ||
      p.includes("/admin") ||
      /\/wikidocs\/?$/.test(p) ||
      p.endsWith("/")
    );
  } catch {
    return false;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  if (!isFromWikiDocument(request)) {
    return new NextResponse("Forbidden — open this file from the wiki document.", {
      status: 403,
      headers: { "cache-control": "no-store" },
    });
  }

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

  // Asset row → page visibility (signed-in users must still be allowed to view).
  const asset = await prisma.wikiAsset.findUnique({
    where: { storedName: name },
    include: { page: true },
  });
  if (asset?.page) {
    const viewer = await currentViewer();
    const page = asset.page;
    if (!canViewPage(page, viewer)) {
      return new NextResponse("Forbidden", { status: 403, headers: { "cache-control": "no-store" } });
    }
  } else {
    // Orphan upload (before the page is saved): require a signed-in session.
    const store = await cookies();
    const session = store.get("wikidocs_session")?.value ?? "";
    const me = session ? await verifyAppSession(session) : null;
    if (!me) {
      return new NextResponse("Forbidden", { status: 403, headers: { "cache-control": "no-store" } });
    }
  }

  try {
    const data = await readFile(full);
    const ext = path.extname(name).slice(1).toLowerCase();
    const type = MIME[ext] ?? asset?.mime ?? "application/octet-stream";
    const headers: Record<string, string> = {
      "content-type": type,
      // Never cache publicly — the origin re-checks Referer / Sec-Fetch every time.
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "same-origin",
    };
    // PDFs / office docs open in the viewer when clicked from the document.
    if (ext === "pdf" || type.includes("officedocument") || type === "application/msword") {
      headers["content-disposition"] = 'inline; filename="' + encodeURIComponent(asset?.filename ?? name) + '"';
    }
    return new NextResponse(data, { headers });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
