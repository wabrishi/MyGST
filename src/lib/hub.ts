import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { UserError } from "./action";
import { db, runTx, type Tx } from "./db";
import { hubMode, hubUrl, isEntitled, limitOf, mapHubRole, monthStartIST, type Entitlement, type SuiteClaims } from "./hub-rules";

export * from "./hub-rules";

/**
 * Suite Hub integration (AUTH_MODE=hub). The Hub is the OIDC provider and owns workspaces, members and
 * subscriptions; MyGST keeps a local mirror (company ↔ Hub workspace, memberships, GST entitlement),
 * refreshed on every Hub sign-in and by Hub events (POST /api/suite/events).
 *
 * One company per user is KEPT (unique membership.userId). When the Hub puts someone in a workspace
 * while they already belong to a different MyGST company, nothing is moved or deleted: their access
 * stays as it is and `user.hubNotice` explains what to do. Removing them from the old company (here or
 * in the Hub) lets the next sign-in add them to the new one.
 */

const asJson = (e: Entitlement | null | undefined) => (e ? (e as unknown as Prisma.InputJsonValue) : Prisma.DbNull);

/**
 * The company for a Hub workspace: linked by hubWorkspaceId, else a pre-Hub company named in
 * `tenants.gst` (linked now), else a new company (owner completes it in the setup wizard).
 */
async function companyForWorkspace(tx: Tx, ws: string, opts: { tenantId?: string | null; name?: string | null; create: boolean }) {
  const linked = await tx.company.findUnique({ where: { hubWorkspaceId: ws } });
  if (linked) return linked;
  if (opts.tenantId) {
    const pre = await tx.company.findUnique({ where: { id: opts.tenantId } });
    if (pre && !pre.hubWorkspaceId) return tx.company.update({ where: { id: pre.id }, data: { hubWorkspaceId: ws } });
  }
  if (!opts.create) return null;
  // stateCode stays empty until the owner finishes setup; documents are blocked until then.
  return tx.company.create({ data: { legalName: opts.name || "My business", stateCode: "", hubWorkspaceId: ws, createdVia: "HUB" } });
}

export type SyncResult = { companyId: string | null; notice: string | null };

/** Upserts company + membership + entitlement from the Hub's claims for this user. */
export async function syncFromClaims(userId: string, c: SuiteClaims): Promise<SyncResult> {
  const result = await runTx(async (tx): Promise<SyncResult> => {
    if (!c.ws) return { companyId: null, notice: "Your suite account isn't part of a workspace yet. Create or join one in your account first." };
    const company = await companyForWorkspace(tx, c.ws, { tenantId: c.tenants?.gst, name: c.ws_name, create: true });
    if (!company) return { companyId: null, notice: null };
    await tx.company.update({
      where: { id: company.id },
      data: { entitlement: asJson(c.modules?.gst), ...(c.ws_name && company.createdVia === "HUB" && !company.setupCompletedAt ? { legalName: c.ws_name } : {}) },
    });

    const role = mapHubRole(c.role);
    const current = await tx.membership.findUnique({ where: { userId }, include: { company: { select: { id: true, legalName: true, tradeName: true } } } });
    if (current && current.companyId !== company.id) {
      const name = current.company.tradeName || current.company.legalName;
      return {
        companyId: current.companyId,
        notice: `Your suite workspace "${c.ws_name ?? "workspace"}" uses a different MyGST company than the one you belong to ("${name}"). A MyGST user can belong to only one company — ask an owner of "${name}" to remove you, then sign in again.`,
      };
    }
    if (current) {
      if (current.role !== role) await tx.membership.update({ where: { id: current.id }, data: { role } });
      return { companyId: company.id, notice: null };
    }
    const seats = limitOf(c.modules?.gst, "users");
    if (seats >= 0 && (await tx.membership.count({ where: { companyId: company.id } })) >= seats) {
      return { companyId: null, notice: `The GST plan for "${c.ws_name ?? "your workspace"}" allows ${seats} user${seats === 1 ? "" : "s"}, and all are taken. Ask the owner to upgrade the plan.` };
    }
    await tx.membership.create({ data: { userId, companyId: company.id, role } });
    await tx.auditLog.create({ data: { companyId: company.id, userId, action: "hub.join", entity: "user", entityId: userId, data: { role } } });
    return { companyId: company.id, notice: null };
  });
  await db.user.update({ where: { id: userId }, data: { hubNotice: result.notice } });
  return result;
}

/** After a Hub sign-in creates a local session: read /userinfo with the stored access token and sync. */
export async function syncAfterLogin(userId: string) {
  const acc = await db.account.findFirst({ where: { userId, providerId: "hub" }, orderBy: { updatedAt: "desc" } });
  if (!acc?.accessToken) return;
  const res = await fetch(`${hubUrl()}/api/auth/oauth2/userinfo`, { headers: { Authorization: `Bearer ${acc.accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Hub userinfo failed: HTTP ${res.status}`);
  await syncFromClaims(userId, (await res.json()) as SuiteClaims);
}

// ───────────────────────── Entitlement enforcement ─────────────────────────

/** Throws a UserError when a new document isn't allowed (subscription ended, or monthly invoice limit reached). */
export async function assertCanCreateDocument(tx: Tx, companyId: string, type: string) {
  if (!hubMode()) return;
  const c = await tx.company.findUniqueOrThrow({ where: { id: companyId }, select: { entitlement: true } });
  if (!isEntitled(c.entitlement)) throw new UserError("Your GST Invoicing subscription has ended. Renew it on your account's Billing page to create documents.");
  if (type !== "INVOICE") return;
  const max = limitOf(c.entitlement, "invoicesPerMonth");
  if (max < 0) return;
  const count = await tx.document.count({ where: { companyId, type: "INVOICE", createdAt: { gte: monthStartIST() } } });
  if (count >= max) throw new UserError(`Your plan allows ${max} invoices per month. Upgrade on your account's Billing page.`);
}

/** Banner text for the company shell, or null when all is well. */
export function entitlementBanner(ent: unknown, now = new Date()): { kind: "danger" | "warning"; text: string } | null {
  if (!hubMode()) return null;
  const e = ent as Entitlement | null;
  if (!e) return { kind: "danger", text: "This workspace has no GST Invoicing subscription — you can view your data, but not create documents." };
  if (!isEntitled(e, now)) return { kind: "danger", text: `Your ${e.plan} plan has ended. Your data is read-only until you renew.` };
  const until = new Date(e.accessUntil ?? e.validUntil).getTime();
  const days = Math.ceil((until - now.getTime()) / 86_400_000);
  if (days <= 7) return { kind: "warning", text: `Your ${e.status === "TRIAL" ? "trial" : `${e.plan} plan`} ends in ${days} day${days === 1 ? "" : "s"}.` };
  return null;
}

// ───────────────────────── Incoming Hub events ─────────────────────────

export interface HubEvent {
  id: string;
  type: string;
  workspaceId: string;
  data?: Record<string, unknown>;
}

/** Applies one Hub event exactly once (inbox dedupe by id). Returns false for a duplicate. */
export async function handleHubEvent(ev: HubEvent): Promise<boolean> {
  const key = createHash("sha256").update(`hub|${ev.workspaceId}|${ev.id}`).digest("hex");
  const ws = ev.workspaceId;
  const d = ev.data ?? {};
  try {
    await runTx(async (tx) => {
      await tx.inboxEvent.create({ data: { id: key, source: "hub", type: ev.type } });
      switch (ev.type) {
        case "workspace.created":
        case "workspace.updated":
        case "workspace.suspended": {
          // Companies are created lazily (first sign-in or first GST subscription event).
          const company = await companyForWorkspace(tx, ws, { create: false });
          if (!company) break;
          const name = typeof d.name === "string" && d.name ? d.name : null;
          const suspended = ev.type === "workspace.suspended" || d.status === "SUSPENDED";
          await tx.company.update({
            where: { id: company.id },
            data: {
              suspendedAt: suspended ? (company.suspendedAt ?? new Date()) : null,
              // The Hub name only replaces a placeholder; owners keep the legal name they entered in setup.
              ...(name && company.createdVia === "HUB" && !company.setupCompletedAt ? { legalName: name } : {}),
            },
          });
          break;
        }
        case "subscription.updated": {
          if (d.module !== "gst") break;
          const ent = (d.entitlement ?? null) as Entitlement | null;
          const w = (d.workspace ?? {}) as { name?: string };
          const company = await companyForWorkspace(tx, ws, { tenantId: typeof d.tenantId === "string" ? d.tenantId : null, name: w.name, create: !!ent });
          if (company) await tx.company.update({ where: { id: company.id }, data: { entitlement: asJson(ent) } });
          break;
        }
        case "member.updated":
        case "member.removed": {
          const company = await companyForWorkspace(tx, ws, { create: false });
          const email = String(d.email ?? "").trim().toLowerCase();
          const user = email ? await tx.user.findUnique({ where: { email } }) : null;
          if (!company || !user) break;
          const m = await tx.membership.findUnique({ where: { userId_companyId: { userId: user.id, companyId: company.id } } });
          if (!m) break;
          if (ev.type === "member.removed") {
            await tx.membership.delete({ where: { id: m.id } });
            await tx.session.deleteMany({ where: { userId: user.id } });
            await tx.auditLog.create({ data: { companyId: company.id, userId: user.id, action: "hub.remove", entity: "user", entityId: user.id } });
          } else {
            const role = mapHubRole(d.role);
            if (role !== m.role) await tx.membership.update({ where: { id: m.id }, data: { role } });
          }
          break;
        }
        default:
          // member.added: the membership is created on that person's first sign-in (needs their Hub identity).
          break;
      }
    });
    return true;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002" && /inbox_event|PRIMARY/i.test(`${JSON.stringify(err.meta ?? "")} ${err.message}`)) return false;
    throw err;
  }
}
