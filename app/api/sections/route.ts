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

export async function GET() {
  const a = await admin();
  if (!a) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sections = await prisma.wikiSection.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { pages: true, children: true } } },
  });
  return NextResponse.json({ sections });
}

export async function POST(request: NextRequest) {
  const a = await admin();
  if (!a) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const { name, parentId, description, sortOrder } = body as any;
  if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });

  const slug = slugify(name);
  if (parentId) {
    const parent = await prisma.wikiSection.findUnique({ where: { id: parentId } });
    if (!parent) return NextResponse.json({ error: "parent_not_found" }, { status: 400 });
    const clash = await prisma.wikiSection.findFirst({ where: { parentId, slug } });
    if (clash) return NextResponse.json({ error: "slug_exists" }, { status: 409 });
  } else {
    const clash = await prisma.wikiSection.findFirst({ where: { parentId: null, slug } });
    if (clash) return NextResponse.json({ error: "slug_exists" }, { status: 409 });
  }

  const section = await prisma.wikiSection.create({
    data: {
      name: name.trim(),
      slug,
      description: description?.trim() || null,
      parentId: parentId || null,
      sortOrder: Number(sortOrder ?? 0),
      createdById: a.id,
    },
  });
  await audit({
    actorUsername: a.username,
    actorName: a.name,
    action: "CREATE_SECTION",
    targetType: "SECTION",
    targetId: section.id,
    details: { name: section.name, slug: section.slug, parentId: section.parentId },
  });
  return NextResponse.json({ section }, { status: 201 });
}
