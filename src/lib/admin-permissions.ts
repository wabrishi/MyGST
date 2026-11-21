/**
 * Platform (admin panel) RBAC: pure definitions, safe to import in client components.
 * Built-in platform roles keep their permissions here; custom platform roles store theirs.
 */

export const ADMIN_PERMISSION_GROUPS = [
  { label: "Overview", items: [["admin.dashboard", "See the admin dashboard and KPIs"]] },
  {
    label: "Companies",
    items: [
      ["companies.view", "See companies and their members"],
      ["companies.manage", "Create, suspend and reactivate companies; invite members"],
    ],
  },
  {
    label: "Website",
    items: [
      ["messages.view", "Read and answer website contact messages"],
      ["website.manage", "Edit the public website's contact details (mobile, email, address)"],
    ],
  },
  {
    label: "Users",
    items: [
      ["users.view", "See all users"],
      ["users.manage", "Disable users, sign them out, reset passwords"],
    ],
  },
  {
    label: "Plugins",
    items: [
      ["plugins.manage", "Install plugins and choose who can use them"],
      ["plugins.upload", "Upload plugin code (runs with full access)"],
    ],
  },
  {
    label: "Platform",
    items: [
      ["backups.manage", "Platform backups"],
      ["audit.view", "Read the audit log"],
      ["system.view", "See system health"],
      ["menu.manage", "Arrange the company sidebar menu"],
      ["roles.manage", "Manage admin roles and who has them"],
    ],
  },
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSION_GROUPS)[number]["items"][number][0];
export const ALL_ADMIN_PERMISSIONS: AdminPermission[] = ADMIN_PERMISSION_GROUPS.flatMap((g) => g.items.map(([k]) => k));

export const PLATFORM_ROLE_KEYS = ["SUPER_ADMIN", "SUPPORT", "VIEWER"] as const;
export type PlatformRoleKey = (typeof PLATFORM_ROLE_KEYS)[number];
export const PLATFORM_ROLE_ID: Record<PlatformRoleKey, string> = { SUPER_ADMIN: "prole_super_admin", SUPPORT: "prole_support", VIEWER: "prole_viewer" };

export const BUILTIN_ADMIN_PERMISSIONS: Record<PlatformRoleKey, readonly AdminPermission[]> = {
  SUPER_ADMIN: ALL_ADMIN_PERMISSIONS,
  SUPPORT: ["admin.dashboard", "companies.view", "users.view", "users.manage", "audit.view", "messages.view"],
  VIEWER: ["admin.dashboard", "companies.view", "system.view"],
};

const isPlatformKey = (k: unknown): k is PlatformRoleKey => typeof k === "string" && (PLATFORM_ROLE_KEYS as readonly string[]).includes(k);

export function storedAdminPermissions(raw: unknown): AdminPermission[] {
  return Array.isArray(raw) ? raw.filter((p): p is AdminPermission => (ALL_ADMIN_PERMISSIONS as unknown[]).includes(p)) : [];
}

export function platformRolePermissions(role: { key: string | null; permissions?: unknown }): readonly AdminPermission[] {
  return isPlatformKey(role.key) ? BUILTIN_ADMIN_PERMISSIONS[role.key] : storedAdminPermissions(role.permissions);
}

/** Admin pages in nav order, with the permission each needs. */
export const ADMIN_PAGES: ReadonlyArray<{ href: string; label: string; perm: AdminPermission; exact?: boolean }> = [
  { href: "/admin", label: "Overview", perm: "admin.dashboard", exact: true },
  { href: "/admin/companies", label: "Companies", perm: "companies.view" },
  { href: "/admin/users", label: "Users", perm: "users.view" },
  { href: "/admin/messages", label: "Messages", perm: "messages.view" },
  { href: "/admin/website", label: "Website", perm: "website.manage" },
  { href: "/admin/plugins", label: "Plugins", perm: "plugins.manage" },
  { href: "/admin/audit", label: "Audit", perm: "audit.view" },
  { href: "/admin/system", label: "System", perm: "system.view" },
  { href: "/admin/menu", label: "Menu", perm: "menu.manage" },
  { href: "/admin/roles", label: "Roles", perm: "roles.manage" },
  { href: "/admin/backups", label: "Backups", perm: "backups.manage" },
];
