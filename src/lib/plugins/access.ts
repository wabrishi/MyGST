/**
 * Who can use a plugin where. Pure functions (no database), shared by the runner, the UI and the API.
 *
 *   Super admin: installs the plugin, sets availability (ALL | SELECTED | NONE), per-company allow/block,
 *                and whether it is on by default.
 *   Owner:       turns an available plugin on/off for their company (null = follow the default).
 */
export interface PluginRow {
  status: "NOT_INSTALLED" | "INSTALLED" | "MISSING";
  availability: "ALL" | "SELECTED" | "NONE";
  defaultEnabled: boolean;
}

export interface CompanyPluginRow {
  allowed: boolean;
  blocked: boolean;
  enabled: boolean | null;
  pausedReason: string | null;
}

/** May this company use the plugin at all (super-admin decision)? */
export function isAvailableTo(p: PluginRow, cp: Pick<CompanyPluginRow, "allowed" | "blocked"> | null | undefined) {
  if (p.status !== "INSTALLED") return false;
  if (p.availability === "NONE") return false;
  if (p.availability === "SELECTED") return !!cp?.allowed;
  return !cp?.blocked;
}

/** Owner's effective on/off (their explicit choice, else the super admin's default). */
export const isTurnedOn = (p: PluginRow, cp: Pick<CompanyPluginRow, "enabled"> | null | undefined) => cp?.enabled ?? p.defaultEnabled;

/** Runs hooks, shows pages and widgets for this company. */
export function isPluginActive(p: PluginRow, cp: CompanyPluginRow | null | undefined) {
  return isAvailableTo(p, cp) && isTurnedOn(p, cp) && !cp?.pausedReason;
}

export type CompanyPluginState = "ACTIVE" | "OFF" | "PAUSED" | "BLOCKED" | "NOT_ALLOWED" | "UNAVAILABLE";

/** Human status for admin tables. */
export function companyPluginState(p: PluginRow, cp: CompanyPluginRow | null | undefined): CompanyPluginState {
  if (p.status !== "INSTALLED" || p.availability === "NONE") return "UNAVAILABLE";
  if (p.availability === "SELECTED" && !cp?.allowed) return "NOT_ALLOWED";
  if (p.availability === "ALL" && cp?.blocked) return "BLOCKED";
  if (!isTurnedOn(p, cp)) return "OFF";
  if (cp?.pausedReason) return "PAUSED";
  return "ACTIVE";
}

export const STATE_LABEL: Record<CompanyPluginState, string> = {
  ACTIVE: "Active",
  OFF: "Turned off by owner",
  PAUSED: "Paused (errors)",
  BLOCKED: "Blocked by admin",
  NOT_ALLOWED: "Not allowed",
  UNAVAILABLE: "Unavailable",
};
