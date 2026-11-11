import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db, type Tx } from "./db";

export async function audit(
  ctx: { companyId: string; user: { id: string } },
  action: string,
  entity: string,
  entityId: string,
  data?: Prisma.InputJsonValue,
  tx: Tx | typeof db = db,
) {
  await tx.auditLog.create({ data: { companyId: ctx.companyId, userId: ctx.user.id, action, entity, entityId, data } });
}
