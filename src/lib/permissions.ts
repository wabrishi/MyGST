/**
 * Company RBAC. A member holds one or more roles; their permissions are the union of those roles'.
 * Built-in roles (Owner, Accountant, Staff) are global rows whose permissions are defined HERE, so new
 * permissions reach them on deploy. Custom roles belong to one company and store their permission list.
 * Every server action checks a permission via `requireCompany(..., perm)`; the UI uses `can()` only to
 * hide controls.
 */

export const PERMISSION_GROUPS = [
  {
    label: "Sales documents",
    items: [
      ["docs.create", "Create and edit their own invoices, quotations and notes"],
      ["docs.viewAll", "See everyone's documents"],
      ["docs.editAny", "Edit any document"],
      ["docs.cancel", "Cancel documents"],
    ],
  },
  {
    label: "Masters",
    items: [
      ["masters.write", "Add and edit parties and products"],
      ["masters.delete", "Delete parties and products"],
    ],
  },
  {
    label: "Money",
    items: [
      ["payments.view", "See payments"],
      ["payments.write", "Record and delete payments"],
      ["purchaseOrders.view", "See purchase orders"],
      ["purchaseOrders.write", "Create, edit, email and close purchase orders"],
      ["purchases.view", "See purchase invoices"],
      ["purchases.write", "Record and edit purchase invoices"],
    ],
  },
  { label: "Reports", items: [["reports.view", "See reports and financial figures"]] },
  {
    label: "Company",
    items: [
      ["company.settings", "Company details, numbering, financial years, setup and data export"],
      ["company.users", "Invite users and change their roles"],
      ["company.roles", "Create and edit roles"],
      ["settings.plugins", "Turn plugins on or off and configure them"],
      ["settings.integrations", "Integrations and webhooks"],
      ["settings.apiKeys", "API keys"],
      ["settings.backups", "Backups"],
    ],
  },
] as const;

export type CorePermission = (typeof PERMISSION_GROUPS)[number]["items"][number][0];
/**
 * `app:<pluginId>`: open that plugin's pages and widgets (see canUseApp).
 * `plugin:<pluginId>:<capability>`: a permission a plugin declares itself (see canPlugin).
 */
export type Permission = CorePermission | `app:${string}` | `plugin:${string}`;

const APP_PERMISSION = /^app:[a-z0-9-]{1,64}$/;
const PLUGIN_PERMISSION = /^plugin:[a-z0-9-]{1,64}:[a-zA-Z0-9_.]{1,60}$/;
export const pluginPermission = (pluginId: string, key: string): Permission => `plugin:${pluginId}:${key}`;

export const ALL_PERMISSIONS: CorePermission[] = PERMISSION_GROUPS.flatMap((g) => g.items.map(([k]) => k));
export const PERMISSION_LABEL = Object.fromEntries(PERMISSION_GROUPS.flatMap((g) => g.items.map(([k, l]) => [k, l]))) as Record<CorePermission, string>;

export const BUILTIN_ROLE_KEYS = ["OWNER", "ACCOUNTANT", "STAFF"] as const;
export type BuiltinRoleKey = (typeof BUILTIN_ROLE_KEYS)[number];

/** Fixed ids of the built-in role rows (created by the rbac migration). */
export const BUILTIN_ROLE_ID: Record<BuiltinRoleKey, string> = { OWNER: "role_owner", ACCOUNTANT: "role_accountant", STAFF: "role_staff" };
export const ROLE_LABEL: Record<BuiltinRoleKey, string> = { OWNER: "Owner", ACCOUNTANT: "Accountant", STAFF: "Staff" };

const STAFF: CorePermission[] = ["docs.create", "masters.write"];
const ACCOUNTANT: CorePermission[] = [
  ...STAFF,
  "docs.viewAll",
  "docs.editAny",
  "docs.cancel",
  "masters.delete",
  "payments.view",
  "payments.write",
  "purchaseOrders.view",
  "purchaseOrders.write",
  "purchases.view",
  "purchases.write",
  "reports.view",
];
export const BUILTIN_PERMISSIONS: Record<BuiltinRoleKey, readonly CorePermission[]> = { OWNER: ALL_PERMISSIONS, ACCOUNTANT, STAFF };

const RANK: Record<BuiltinRoleKey, number> = { STAFF: 1, ACCOUNTANT: 2, OWNER: 3 };
export const isBuiltinKey = (k: unknown): k is BuiltinRoleKey => typeof k === "string" && (BUILTIN_ROLE_KEYS as readonly string[]).includes(k);

/** A role as needed to resolve permissions. */
export interface RoleLike {
  id: string;
  key: string | null;
  name: string;
  permissions?: unknown;
}

/** Valid permissions stored on a custom role (unknown keys are dropped). */
export function storedPermissions(raw: unknown): Permission[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((p): p is Permission => typeof p === "string" && ((ALL_PERMISSIONS as string[]).includes(p) || APP_PERMISSION.test(p) || PLUGIN_PERMISSION.test(p)));
}

export function rolePermissions(role: RoleLike): readonly Permission[] {
  return isBuiltinKey(role.key) ? BUILTIN_PERMISSIONS[role.key] : storedPermissions(role.permissions);
}

/** Union of all roles' permissions. */
export function resolvePermissions(roles: RoleLike[]): Set<Permission> {
  const out = new Set<Permission>();
  for (const r of roles) for (const p of rolePermissions(r)) out.add(p);
  return out;
}

/** Highest built-in role held (null for custom-only members). Kept for plugins and external tokens. */
export function primaryRole(roles: Pick<RoleLike, "key">[]): BuiltinRoleKey | null {
  let best: BuiltinRoleKey | null = null;
  for (const r of roles) if (isBuiltinKey(r.key) && (!best || RANK[r.key] > RANK[best])) best = r.key;
  return best;
}

export const roleNames = (roles: Pick<RoleLike, "name">[]) => roles.map((r) => r.name).join(", ") || "No role";

export interface Grants {
  permissions: ReadonlySet<string>;
}

export const can = (who: Grants | null | undefined, perm: Permission) => !!who && who.permissions.has(perm);

/** Any of the given permissions. */
export const canAny = (who: Grants | null | undefined, perms: readonly Permission[]) => perms.some((p) => can(who, p));

/**
 * Plugin pages/widgets/routes declare the built-in roles that may use them. A member may use them when
 * one of their built-in roles is listed, or a custom role grants `app:<pluginId>`.
 */
export function canUseApp(who: (Grants & { roles: Pick<RoleLike, "key">[] }) | null | undefined, pluginId: string, allowed: readonly string[]) {
  if (!who) return false;
  return who.roles.some((r) => r.key && allowed.includes(r.key)) || who.permissions.has(`app:${pluginId}`);
}

/** A plugin capability as declared in its manifest (`capabilities`). */
export interface CapabilityLike {
  key: string;
  roles: readonly string[];
}

/**
 * A plugin's own permission (manifest `capabilities`): owners always hold it; other built-in roles hold
 * it when the plugin lists them; custom roles hold it when they grant `plugin:<id>:<key>`.
 */
export function canPlugin(who: (Grants & { roles: Pick<RoleLike, "key">[] }) | null | undefined, pluginId: string, capabilities: readonly CapabilityLike[], key: string) {
  if (!who) return false;
  const cap = capabilities.find((c) => c.key === key);
  if (!cap) return false;
  if (who.roles.some((r) => r.key === "OWNER")) return true;
  return who.roles.some((r) => r.key && cap.roles.includes(r.key)) || who.permissions.has(pluginPermission(pluginId, key));
}

/**
 * Whether a member holds a permission they want to put in a custom role (no privilege escalation).
 * Owners hold every plugin permission; others need it themselves. `capabilities` maps plugin id → its list.
 */
export function holdsGrantable(who: Grants & { roles: Pick<RoleLike, "key">[] }, perm: string, capabilities: ReadonlyMap<string, readonly CapabilityLike[]>) {
  const isOwner = who.roles.some((r) => r.key === "OWNER");
  if (APP_PERMISSION.test(perm)) return isOwner || who.permissions.has(perm);
  const m = /^plugin:([a-z0-9-]{1,64}):([a-zA-Z0-9_.]{1,60})$/.exec(perm);
  if (m) return canPlugin(who, m[1], capabilities.get(m[1]) ?? [], m[2]);
  return who.permissions.has(perm);
}

/** The settings area: open when any of these is held. */
export const SETTINGS_PERMISSIONS: Permission[] = [
  "company.settings",
  "company.users",
  "company.roles",
  "settings.plugins",
  "settings.integrations",
  "settings.apiKeys",
  "settings.backups",
];
