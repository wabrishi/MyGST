import type { Role } from "@/generated/prisma/enums";

/** Higher number = more privileges. */
const RANK: Record<Role, number> = { STAFF: 1, ACCOUNTANT: 2, OWNER: 3 };

export const atLeast = (role: Role, min: Role) => RANK[role] >= RANK[min];

export const ROLE_LABEL: Record<Role, string> = { OWNER: "Owner", ACCOUNTANT: "Accountant", STAFF: "Staff" };

/**
 * Central permission matrix. Every server action checks one of these via `requireCompany(..., perm)`.
 * UI uses the same table to hide controls, but the server check is what protects data.
 */
export const PERMISSIONS = {
  "docs.create": "STAFF", // invoices, quotations, notes
  "docs.editAny": "ACCOUNTANT", // STAFF may only edit their own docs on the same day
  "docs.cancel": "ACCOUNTANT",
  "masters.write": "STAFF", // parties, products
  "masters.delete": "ACCOUNTANT",
  "payments.write": "ACCOUNTANT",
  "purchases.write": "ACCOUNTANT",
  "purchases.view": "ACCOUNTANT",
  "reports.view": "ACCOUNTANT",
  "company.settings": "OWNER",
  "company.users": "OWNER",
} as const satisfies Record<string, Role>;

export type Permission = keyof typeof PERMISSIONS;

export const can = (role: Role, perm: Permission) => atLeast(role, PERMISSIONS[perm]);
