import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyAppSession } from "@/lib/session";
import { canViewPage, canPublish, getPolicy, slugify } from "@/lib/wiki";
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
  const { id } = await params;
  const v = await viewer();
  const page = await prisma.wikiPage.findUnique({
    where: { id },
    include: { currentVersion: true, section: true },
  });
  if (!page) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!canViewPage(page, v)) {
    return NextResponse.json({ error: "not_allowed" }, { status: 403 });
  }
  return NextResponse.json({
    page: {
      id: page.id,
      title: page.title,
      slug: page.slug,
      sectionId: page.sectionId,
      sectionName: page.section.name,
      visibility: page.visibility,
      allowedRoles: page.allowedRoles,
      allowedUsers: page.allowedUsers,
      status: page.status,
      publishedAt: page.publishedAt,
      content: page.currentVersion?.content ?? "",
      currentVersionId: page.currentVersionId,
      version: page.currentVersion?.version ?? 0,
      updatedAtLabel: page.updatedAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
    },
  });
}

export async function PATCH(
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
  const local = await prisma.appUser.findUnique({ where: { username: v.username } });
  const body = await request.json().catch(() => ({}));
  const { title, content, changeSummary, visibility, allowedRoles, allowedUsers, slug, action } = body as any;

  const page = await prisma.wikiPage.findUnique({
    where: { id },
    include: { section: true, currentVersion: true },
  });
  if (!page) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const nextTitle = title?.trim() || page.title;
  let nextSlug = page.slug;
  if (slug?.trim() && slug.trim() !== page.slug) {
    const candidate = slugify(slug);
    const clash = await prisma.wikiPage.findUnique({
      where: { sectionId_slug: { sectionId: page.sectionId, slug: candidate } },
    });
    if (clash && clash.id !== page.id) {
      return NextResponse.json({ error: "slug_exists" }, { status: 409 });
    }
    nextSlug = candidate;
  }

  const isSave = action === "save" || !action;
  const isPublish = action === "publish";
  const isUnpublish = action === "unpublish";

  if (isSave || isPublish) {
    const version = await prisma.wikiPageVersion.create({
      data: {
        pageId: page.id,
        version: (page.currentVersion?.version ?? 0) + 1,
        title: nextTitle,
        content: content ?? page.currentVersion?.content ?? "",
        changeSummary: changeSummary?.trim() || (isPublish ? "Publish" : "Draft update"),
        authorId: local?.id ?? null,
        isPublished: isPublish,
        publishedAt: isPublish ? new Date() : null,
      },
    });
    await prisma.wikiPage.update({
      where: { id: page.id },
      data: {
        title: nextTitle,
        slug: nextSlug,
        visibility: visibility ?? page.visibility,
        allowedRoles: allowedRoles ?? page.allowedRoles,
        allowedUsers: allowedUsers ?? page.allowedUsers,
        currentVersionId: version.id,
        status: isPublish ? "PUBLISHED" : page.status,
        publishedAt: isPublish ? new Date() : page.publishedAt,
        publishedById: isPublish ? (local?.id ?? null) : page.publishedById,
      },
    });
    await audit({
      actorUsername: v.username,
      actorName: v.name ?? v.username,
      action: isPublish ? "PUBLISH_PAGE" : "SAVE_VERSION",
      targetType: "PAGE",
      targetId: page.id,
      details: { title: nextTitle, version: (page.currentVersion?.version ?? 0) + 1 },
    });
  } else if (isUnpublish) {
    await prisma.wikiPage.update({
      where: { id: page.id },
      data: { status: "DRAFT", publishedAt: null, publishedById: null },
    });
    await audit({
      actorUsername: v.username,
      actorName: v.name ?? v.username,
      action: "UNPUBLISH_PAGE",
      targetType: "PAGE",
      targetId: page.id,
      details: { title: page.title },
    });
  }

  const updated = await prisma.wikiPage.findUnique({
    where: { id },
    include: { currentVersion: true },
  });
  return NextResponse.json({ page: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const v = await viewer();
  if (!v) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (v.role !== "ADMIN") {
    return NextResponse.json({ error: "not_allowed" }, { status: 403 });
  }
  const page = await prisma.wikiPage.findUnique({ where: { id } });
  if (!page) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await prisma.wikiPage.delete({ where: { id } });
  await audit({
    actorUsername: v.username,
    actorName: v.name ?? v.username,
    action: "DELETE_PAGE",
    targetType: "PAGE",
    targetId: id,
    details: { title: page.title },
  });
  return NextResponse.json({ ok: true });
}
