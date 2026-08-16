import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyAppSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const store = await cookies();
  const session = store.get("wikidocs_session")?.value ?? "";
  const me = await verifyAppSession(session);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const local = await prisma.appUser.findUnique({ where: { username: me.username } });
  if (local?.role !== "ADMIN") {
    return NextResponse.json({ error: "not_allowed" }, { status: 403 });
  }

  const page = Math.max(1, Number(request.nextUrl.searchParams.get("page") ?? 1));
  const limit = Math.min(100, Math.max(10, Number(request.nextUrl.searchParams.get("limit") ?? 25)));
  const action = request.nextUrl.searchParams.get("action") ?? "";
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();

  const where: any = {
    ...(action ? { action } : {}),
    ...(q
      ? {
          OR: [
            { actorUsername: { contains: q, mode: "insensitive" } },
            { actorName: { contains: q, mode: "insensitive" } },
            { action: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return NextResponse.json({
    logs: logs.map((l) => ({
      id: l.id,
      actorUsername: l.actorUsername,
      actorName: l.actorName,
      action: l.action,
      targetType: l.targetType,
      targetId: l.targetId,
      details: l.details,
      createdAtLabel: l.createdAt.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
    })),
    total,
    page,
    pages: Math.ceil(total / limit),
  });
}
