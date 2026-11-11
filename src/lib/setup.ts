import "server-only";
import { db } from "./db";
import { financialYear, todayIST } from "./gst/fy";

export const SETUP_STEPS = [
  { step: 1, key: "business", title: "Business & GST", desc: "Legal name, GSTIN, state and address" },
  { step: 2, key: "invoice", title: "Bank & invoice", desc: "Bank / UPI details, logo and terms printed on invoices" },
  { step: 3, key: "numbering", title: "Numbering & year", desc: "Invoice prefixes and financial year" },
  { step: 4, key: "team", title: "Team", desc: "Invite your accountant and staff" },
  { step: 5, key: "records", title: "First records", desc: "Add a customer and a product, then finish" },
] as const;

export type SetupKey = (typeof SETUP_STEPS)[number]["key"];

/**
 * Setup checklist, derived from the company's actual data so it can never drift out of sync.
 * Used by the owner wizard, the dashboard banner and the super-admin panel.
 */
export async function setupStatus(companyId: string) {
  const fy = financialYear(todayIST());
  const [c, series, members, invites, parties, products] = await Promise.all([
    db.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { legalName: true, gstin: true, address: true, stateCode: true, bankAccount: true, upiId: true, logoMime: true, setupCompletedAt: true },
    }),
    db.numberSeries.count({ where: { companyId, fy } }),
    db.membership.count({ where: { companyId } }),
    db.invitation.count({ where: { companyId, acceptedAt: null } }),
    db.party.count({ where: { companyId } }),
    db.product.count({ where: { companyId } }),
  ]);

  const done: Record<SetupKey, boolean> = {
    business: !!(c.legalName && c.stateCode && c.address),
    invoice: !!(c.bankAccount || c.upiId),
    numbering: series > 0,
    team: members > 1 || invites > 0,
    records: parties > 0 && products > 0,
  };
  const steps = SETUP_STEPS.map((s) => ({ ...s, done: done[s.key] }));
  const completed = steps.filter((s) => s.done).length;
  return {
    steps,
    completed,
    total: steps.length,
    percent: Math.round((completed / steps.length) * 100),
    finished: !!c.setupCompletedAt,
    hasGstin: !!c.gstin,
    counts: { members, invites, parties, products },
  };
}

export type SetupStatus = Awaited<ReturnType<typeof setupStatus>>;
