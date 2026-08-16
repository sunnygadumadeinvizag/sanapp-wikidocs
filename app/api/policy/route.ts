import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyAppSession } from "@/lib/session";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

async function viewer() {
  const store = await cookies();
  const session = store.get("wikidocs_session")?.value ?? "";
  const me = await verifyAppSession(session);
  return me;
}

export async function GET() {
  const me = await viewer();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const p = await prisma.publishPolicy.findFirst();
  return NextResponse.json({
    policy: {
      allowedRoles: p?.allowedRoles ?? [],
      allowedUsers: p?.allowedUsers ?? [],
    },
  });
}

export async function PUT(request: NextRequest) {
  const me = await viewer();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const local = await prisma.appUser.findUnique({ where: { username: me.username } });
  if (local?.role !== "ADMIN") {
    return NextResponse.json({ error: "not_allowed" }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const allowedRoles = Array.isArray(body.allowedRoles) ? body.allowedRoles.map(String) : [];
  const allowedUsers = Array.isArray(body.allowedUsers) ? body.allowedUsers.map(String) : [];

  const existing = await prisma.publishPolicy.findFirst();
  const policy = existing
    ? await prisma.publishPolicy.update({
        where: { id: existing.id },
        data: { allowedRoles, allowedUsers, updatedById: local.id },
      })
    : await prisma.publishPolicy.create({
        data: { id: "default-policy", allowedRoles, allowedUsers, updatedById: local.id },
      });

  await audit({
    actorUsername: me.username,
    actorName: me.name,
    action: "POLICY_UPDATE",
    targetType: "POLICY",
    targetId: policy.id,
    details: { allowedRoles, allowedUsers },
  });
  return NextResponse.json({ policy });
}
