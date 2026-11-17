import type { Permission } from "@/lib/permissions";

/** Settings tabs and the permission each needs. Slugs starting with "/" live outside /settings. */
export const SETTINGS_TABS: ReadonlyArray<readonly [slug: string, label: string, perm: Permission]> = [
  ["company", "Company", "company.settings"],
  ["users", "Users", "company.users"],
  ["roles", "Roles", "company.roles"],
  ["numbering", "Numbering", "company.settings"],
  ["financial-years", "Financial years", "company.settings"],
  ["backup", "Backup", "settings.backups"],
  ["api-keys", "API keys", "settings.apiKeys"],
  ["integrations", "Integrations", "settings.integrations"],
  ["plugins", "Plugins", "settings.plugins"],
  ["/setup", "Setup wizard", "company.settings"],
];
