import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyAppSession } from "@/lib/session";
import { slugify } from "@/lib/wiki";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

async function admin() {
  const store = await cookies();
  const session = store.get("wikidocs_session")?.value ?? "";
  const me = await verifyAppSession(session);
  if (!me) return null;
  const local = await prisma.appUser.findUnique({ where: { username: me.username } });
  return local?.role === "ADMIN"
    ? { username: me.username, name: me.name, id: local.id }
    : null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const a = await admin();
  if (!a) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const section = await prisma.wikiSection.findUnique({ where: { id } });
  if (!section) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const { name, description, sortOrder, parentId, slug } = body as any;

  let nextSlug = section.slug;
  if (slug?.trim() && slug.trim() !== section.slug) {
    nextSlug = slugify(slug);
    const clash = await prisma.wikiSection.findFirst({
      where: { parentId: section.parentId, slug: nextSlug, NOT: { id } },
    });
    if (clash) return NextResponse.json({ error: "slug_exists" }, { status: 409 });
  } else if (name?.trim() && name.trim() !== section.name && !slug?.trim()) {
    nextSlug = slugify(name);
    const clash = await prisma.wikiSection.findFirst({
      where: { parentId: section.parentId, slug: nextSlug, NOT: { id } },
    });
    if (clash) nextSlug = section.slug; // keep the old slug on clash
  }

  const updated = await prisma.wikiSection.update({
    where: { id },
    data: {
      name: name?.trim() || section.name,
      slug: nextSlug,
      description: description !== undefined ? (description?.trim() || null) : section.description,
      sortOrder: sortOrder !== undefined ? Number(sortOrder) : section.sortOrder,
      parentId: parentId !== undefined ? (parentId || null) : section.parentId,
    },
  });
  await audit({
    actorUsername: a.username,
    actorName: a.name,
    action: "UPDATE_SECTION",
    targetType: "SECTION",
    targetId: id,
    details: { name: updated.name, slug: updated.slug },
  });
  return NextResponse.json({ section: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const a = await admin();
  if (!a) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const section = await prisma.wikiSection.findUnique({
    where: { id },
    include: { _count: { select: { pages: true, children: true } } },
  });
  if (!section) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const pageCount = section._count.pages;
  const childCount = section._count.children;
  await prisma.wikiSection.delete({ where: { id } });

  await audit({
    actorUsername: a.username,
    actorName: a.name,
    action: "DELETE_SECTION",
    targetType: "SECTION",
    targetId: id,
    details: { name: section.name, pagesDeleted: pageCount, childrenDeleted: childCount },
  });
  return NextResponse.json({ ok: true });
}
