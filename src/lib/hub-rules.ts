import { timingSafeEqual } from "node:crypto";
import type { Role } from "@/generated/prisma/enums";
import { signPayload } from "./events/signing";

/**
 * Pure rules for the suite Hub integration (AUTH_MODE=hub): no database, so they're unit-tested directly.
 * The Hub's contract is LeadManager/docs/ARCHITECTURE.md §2 (claims) and §5 (events).
 */
export const hubMode = () => process.env.AUTH_MODE === "hub";
export const hubUrl = () => (process.env.HUB_URL ?? "").replace(/\/+$/, "");
/** Where an owner renews or upgrades the GST plan. */
export const hubBillingUrl = (ws: string | null | undefined) => (ws ? `${hubUrl()}/w/${encodeURIComponent(ws)}/billing` : `${hubUrl()}/home`);
export const hubTeamUrl = (ws: string | null | undefined) => (ws ? `${hubUrl()}/w/${encodeURIComponent(ws)}/team` : `${hubUrl()}/home`);

export interface Entitlement {
  plan: string;
  status: "TRIAL" | "ACTIVE" | "EXPIRED" | "CANCELLED";
  active: boolean;
  validUntil: string;
  accessUntil?: string;
  limits: Record<string, number>;
}

export interface SuiteClaims {
  sub: string;
  email: string;
  name?: string;
  ws: string | null;
  ws_name: string | null;
  role: "OWNER" | "MANAGER" | "MEMBER" | null;
  modules?: Partial<Record<"leads" | "gst" | "wa", Entitlement>>;
  /** Pre-Hub tenant ids per module: tenants.gst = an existing MyGST company id linked to this workspace. */
  tenants?: Partial<Record<string, string>>;
  super_admin?: boolean;
}

/** Hub role -> MyGST role. */
export function mapHubRole(role: unknown): Role {
  return role === "OWNER" ? "OWNER" : role === "MANAGER" ? "ACCOUNTANT" : "STAFF";
}

/** Can this company create documents right now? Local mode: always. Hub mode: per the GST subscription. */
export function isEntitled(ent: unknown, now = new Date(), hub = hubMode()) {
  if (!hub) return true;
  const e = ent as Entitlement | null;
  if (!e) return false;
  if (e.status === "CANCELLED") return false;
  const until = e.accessUntil ?? e.validUntil;
  return until ? now.getTime() <= new Date(until).getTime() : !!e.active;
}

/** A plan limit; -1 (or missing) = unlimited. */
export function limitOf(ent: unknown, key: string): number {
  const v = (ent as Entitlement | null)?.limits?.[key];
  return typeof v === "number" ? v : -1;
}

/** First instant of the current calendar month in India (invoice limits are per month, IST). */
export function monthStartIST(now = new Date()) {
  const ist = new Date(now.getTime() + 330 * 60_000);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - 330 * 60_000);
}

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Verifies X-Suite-Signature (v1=HMAC-SHA256(secret, "<ts>.<raw body>")) within a 5-minute window. */
export function verifyHubSignature(secret: string, ts: number, raw: string, signature: string, nowSec = Date.now() / 1000) {
  if (!secret || !Number.isFinite(ts) || ts <= 0 || Math.abs(nowSec - ts) > 300) return false;
  return safeEqual(signature, signPayload(secret, ts, raw));
}
