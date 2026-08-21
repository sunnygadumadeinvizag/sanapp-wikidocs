import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyAppSession } from "@/lib/session";
import { canPublish, canViewPage, diffLines, getPolicy } from "@/lib/wiki";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

async function viewer() {
  const store = await cookies();
  const session = store.get("wikidocs_session")?.value ?? "";
  const me = await verifyAppSession(session);
  return me ? { username: me.username, role: me.role, primaryRole: me.primaryRole, name: me.name } : null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const v = await viewer();
  if (!v) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const page = await prisma.wikiPage.findUnique({
    where: { id },
    select: {
      id: true,
      visibility: true,
      allowedRoles: true,
      allowedUsers: true,
      status: true,
    },
  });
  if (!page) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Anyone who may READ the page may see its activity (who changed it);
  // only the App Admin gets the content of each version and the diffs.
  if (!canViewPage(page, v)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const isAdmin = v.role === "ADMIN";

  const versions = await prisma.wikiPageVersion.findMany({
    where: { pageId: id },
    include: { author: { select: { name: true } } },
    orderBy: { version: "desc" },
  });

  return NextResponse.json({
    versions: versions.map((v2, i) => {
      const prev = isAdmin && i < versions.length - 1 ? versions[i + 1] : null;
      const diff = prev ? diffLines(prev.content, v2.content) : null;
      return {
        id: v2.id,
        version: v2.version,
        title: v2.title,
        changeSummary: v2.changeSummary,
        isPublished: v2.isPublished,
        authorName: v2.author?.name ?? "Unknown",
        createdAtLabel: v2.createdAt.toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
        // Admin-only extras — what exactly changed in this version.
        ...(isAdmin
          ? {
              addedCount: diff?.added.length ?? 0,
              removedCount: diff?.removed.length ?? 0,
              addedLines: (diff?.added ?? []).slice(0, 100),
              removedLines: (diff?.removed ?? []).slice(0, 100),
            }
          : {}),
      };
    }),
  });
}

/** Restore a previous version as a NEW draft version (edit history is never rewritten). */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const v = await viewer();
  if (!v) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const policy = await getPolicy();
  if (!canPublish(v, policy)) {
    return NextResponse.json({ error: "not_allowed" }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const versionId = body.versionId as string;
  if (!versionId) return NextResponse.json({ error: "versionId required" }, { status: 400 });

  const source = await prisma.wikiPageVersion.findUnique({ where: { id: versionId } });
  if (!source || source.pageId !== id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const page = await prisma.wikiPage.findUnique({ where: { id }, include: { currentVersion: true } });
  if (!page) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const local = await prisma.appUser.findUnique({ where: { username: v.username } });
  const restored = await prisma.wikiPageVersion.create({
    data: {
      pageId: id,
      version: (page.currentVersion?.version ?? 0) + 1,
      title: source.title,
      content: source.content,
      changeSummary: `Restored from version ${source.version}`,
      authorId: local?.id ?? null,
      isPublished: false,
    },
  });
  await prisma.wikiPage.update({
    where: { id },
    data: {
      title: source.title,
      currentVersionId: restored.id,
      status: "DRAFT",
    },
  });
  await audit({
    actorUsername: v.username,
    actorName: v.name ?? v.username,
    action: "RESTORE_VERSION",
    targetType: "VERSION",
    targetId: restored.id,
    details: { pageId: id, fromVersion: source.version, toVersion: restored.version },
  });
  return NextResponse.json({ ok: true });
}
