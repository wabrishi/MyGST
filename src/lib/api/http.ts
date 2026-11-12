import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { UserError } from "../action";
import { db } from "../db";
import { hashApiKey, looksLikeApiKey } from "./keys";
import type { CompanyContext } from "../tenant";

/** JSON response helpers for /api/v1 — errors are always `{ "error": "message" }`. */
export const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export const apiError = (message: string, status = 400) => json({ error: message }, status);

class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/**
 * Authenticates `Authorization: Bearer <key>` and resolves the company. The API acts as the user
 * who created the key, so audit logs and createdBy stay meaningful — and a key stops working if
 * that user leaves the company. `X-Suite-Workspace` is accepted but ignored: the key decides the company.
 */
export async function authenticate(request: Request): Promise<CompanyContext & { apiKeyId: string }> {
  const header = request.headers.get("authorization") ?? "";
  const key = header.replace(/^Bearer\s+/i, "").trim();
  if (!key || !looksLikeApiKey(key)) throw new ApiError("Missing or malformed API key", 401);

  const row = await db.apiKey.findUnique({
    where: { keyHash: hashApiKey(key) },
    include: { company: { select: { id: true, legalName: true, tradeName: true, stateCode: true, gstin: true, suspendedAt: true } } },
  });
  if (!row || row.revokedAt) throw new ApiError("Invalid or revoked API key", 401);
  if (row.company.suspendedAt) throw new ApiError("Company is suspended", 403);

  const member = await db.membership.findUnique({
    where: { userId_companyId: { userId: row.createdById, companyId: row.companyId } },
    select: { role: true, user: { select: { id: true, name: true, email: true } } },
  });
  if (!member) throw new ApiError("The user who created this API key no longer has access; create a new key", 401);

  // Cheap usage tracking (at most once a minute per key).
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) {
    await db.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  }
  const { suspendedAt: _s, ...company } = row.company;
  void _s;
  return { user: member.user, companyId: company.id, role: member.role, company, apiKeyId: row.id };
}

export async function readJson(request: Request): Promise<unknown> {
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) throw new ApiError("Content-Type must be application/json", 415);
  const text = await request.text();
  if (text.length > 200_000) throw new ApiError("Request body too large", 413);
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError("Body is not valid JSON", 400);
  }
}

/** Converts thrown errors into `{ error }` JSON with a sensible status. */
export function toErrorResponse(err: unknown) {
  if (err instanceof ApiError) return apiError(err.message, err.status);
  if (err instanceof z.ZodError) {
    const i = err.issues[0];
    return apiError(i ? `${i.path.join(".") || "body"}: ${i.message}` : "Invalid request", 400);
  }
  if (err instanceof UserError) return apiError(err.message, 422);
  console.error("[api/v1]", err);
  return apiError("Internal error", 500);
}

const IDEMPOTENCY_TTL_MS = 24 * 3600 * 1000;

/**
 * Runs `handler` for an API route. With an `Idempotency-Key` header, the first response for
 * (company, key, route) is stored and replayed for 24 h; replays carry `Idempotent-Replayed: true`.
 */
export async function handle(
  request: Request,
  route: string,
  handler: (ctx: Awaited<ReturnType<typeof authenticate>>) => Promise<{ status?: number; body: unknown }>,
) {
  try {
    const ctx = await authenticate(request);
    const idemKey = request.headers.get("idempotency-key")?.trim().slice(0, 200);

    if (idemKey) {
      const prev = await db.idempotencyRecord.findUnique({ where: { companyId_key_route: { companyId: ctx.companyId, key: idemKey, route } } });
      if (prev && Date.now() - prev.createdAt.getTime() < IDEMPOTENCY_TTL_MS) {
        return Response.json(prev.response, { status: prev.status, headers: { "Idempotent-Replayed": "true", "Cache-Control": "no-store" } });
      }
      if (prev) await db.idempotencyRecord.delete({ where: { id: prev.id } }).catch(() => {});
    }

    const { status = 200, body } = await handler(ctx);

    if (idemKey && status < 500) {
      await db.idempotencyRecord
        .create({ data: { companyId: ctx.companyId, key: idemKey, route, status, response: body as Prisma.InputJsonValue } })
        .catch(() => {}); // a concurrent duplicate already stored its response — fine
      // Opportunistic cleanup of expired records.
      if (Math.random() < 0.02) {
        await db.idempotencyRecord.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - IDEMPOTENCY_TTL_MS) } } }).catch(() => {});
      }
    }
    return json(body, status);
  } catch (err) {
    return toErrorResponse(err);
  }
}
