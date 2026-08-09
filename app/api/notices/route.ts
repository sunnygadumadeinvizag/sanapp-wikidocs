import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyAppSession } from "@/lib/session";

const WRITE_ROLES = ["ADMIN", "FACULTY", "STAFF"];

async function currentUser() {
  const store = await cookies();
  const session = store.get("app1_session")?.value;
  const user = session ? await verifyAppSession(session) : null;
  if (!user) return null;
  const local = await prisma.appUser.findUnique({ where: { username: user.username } });
  return local;
}

export async function GET() {
  const notices = await prisma.notice.findMany({
    orderBy: { createdAt: "desc" },
    include: { author: { select: { name: true, role: true } } },
  });
  return NextResponse.json({ notices });
}

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!WRITE_ROLES.includes(user.role)) {
    return NextResponse.json(
      { error: `Role ${user.role} cannot publish notices` },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const title = String(body.title ?? "").trim();
  const text = String(body.body ?? "").trim();
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const notice = await prisma.notice.create({
    data: { title, body: text, authorId: user.id },
    include: { author: { select: { name: true, role: true } } },
  });
  return NextResponse.json({ notice }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (user.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Only the ADMIN role can delete notices" },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  await prisma.notice.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
