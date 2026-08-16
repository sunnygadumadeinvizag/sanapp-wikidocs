import { prisma } from "./prisma";

export async function audit(args: {
  actorUsername: string;
  actorName: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  details?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorUsername: args.actorUsername,
        actorName: args.actorName,
        action: args.action,
        targetType: args.targetType,
        targetId: args.targetId ?? null,
        details: (args.details ?? null) as any,
      },
    });
  } catch (e) {
    console.error("audit failed", e);
  }
}
