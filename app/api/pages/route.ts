import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyAppSession } from "@/lib/session";
import { canViewPage, canPublish, getPolicy, slugify, sectionChain } from "@/lib/wiki";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

async function viewer() {
  const store = await cookies();
  const session = store.get("wikidocs_session")?.value ?? "";
  const me = await verifyAppSession(session);
  return me ? { username: me.username, role: me.role, primaryRole: me.primaryRole } : null;
}

export async function GET(request: NextRequest) {
  const v = await viewer();
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();
  const sectionId = request.nextUrl.searchParams.get("sectionId") ?? "";

  const pages = await prisma.wikiPage.findMany({
    where: {
      sectionId: sectionId || undefined,
      ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { slug: { contains: q, mode: "insensitive" } }] } : {}),
    },
    include: { section: true, currentVersion: true },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  const visible = [];
  for (const p of pages) {
    if (!canViewPage(p, v)) continue;
    const chain = await sectionChain(p.sectionId);
    visible.push({
      id: p.id,
      title: p.title,
      slug: p.slug,
      visibility: p.visibility,
      status: p.status,
      sectionName: p.section.name,
      sectionPath: chain,
      updatedAtLabel: p.updatedAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
      excerpt: p.currentVersion?.content?.replace(/[#*`>\[\]!-]/g, "").slice(0, 160) ?? "",
    });
  }
  return NextResponse.json({ pages: visible });
}

export async function POST(request: NextRequest) {
  const v = await viewer();
  if (!v) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const policy = await getPolicy();
  if (!canPublish(v, policy)) {
    return NextResponse.json({ error: "not_allowed" }, { status: 403 });
  }
  const me = v as { username: string; role: string; primaryRole: string; name?: string };
  const body = await request.json().catch(() => ({}));
  const { sectionId, title, content = "", visibility = "AUTHENTICATED", allowedRoles = [], allowedUsers = [] } = body as any;

  if (!sectionId || !title?.trim()) {
    return NextResponse.json({ error: "sectionId and title are required" }, { status: 400 });
  }
  const section = await prisma.wikiSection.findUnique({ where: { id: sectionId } });
  if (!section) return NextResponse.json({ error: "section_not_found" }, { status: 400 });

  const local = await prisma.appUser.findUnique({ where: { username: v.username } });
  const slug = slugify(title);
  const existing = await prisma.wikiPage.findUnique({
    where: { sectionId_slug: { sectionId, slug } },
  });
  if (existing) {
    return NextResponse.json({ error: "slug_exists", slug: existing.slug }, { status: 409 });
  }

  const page = await prisma.wikiPage.create({
    data: {
      sectionId,
      title: title.trim(),
      slug,
      visibility: visibility as any,
      allowedRoles,
      allowedUsers,
      status: "DRAFT",
      createdById: local?.id ?? null,
    },
  });
  const version = await prisma.wikiPageVersion.create({
    data: {
      pageId: page.id,
      version: 1,
      title: page.title,
      content,
      changeSummary: "Initial draft",
      authorId: local?.id ?? null,
      isPublished: false,
    },
  });
  await prisma.wikiPage.update({ where: { id: page.id }, data: { currentVersionId: version.id } });

  await audit({
    actorUsername: v.username,
    actorName: (me as any).name ?? v.username,
    action: "CREATE_PAGE",
    targetType: "PAGE",
    targetId: page.id,
    details: { title: page.title, section: section.name },
  });

  return NextResponse.json({ page: { id: page.id, slug: page.slug } }, { status: 201 });
}
