import { redirect } from "next/navigation";
import { ButtonLink } from "@/components/ui";
import { getSessionUser } from "@/lib/auth";

const FEATURES = [
  ["GST-compliant invoices", "CGST/SGST or IGST picked automatically from place of supply. Print or download PDF."],
  ["Quotations & notes", "Convert quotes to invoices; issue credit and debit notes against invoices."],
  ["Payments & outstanding", "Record receipts, track unpaid invoices, ageing and party ledgers."],
  ["Purchases & ITC", "Record purchase bills and see eligible input tax credit."],
  ["GSTR-1 & GSTR-3B", "B2B, B2CL, B2CS, CDNR, HSN summary — export to CSV for filing."],
  ["Multi-company, multi-user", "Invite your accountant and staff with role-based access."],
];

export default async function Home() {
  if (await getSessionUser()) redirect("/companies");
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-16">
      <div className="text-center">
        <h1 className="text-4xl font-bold">
          GST billing, <span className="text-primary">done right.</span>
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-base text-muted">
          Create GST invoices, track payments and prepare your returns — for every business you run.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <ButtonLink href="/signup">Get started free</ButtonLink>
          <ButtonLink href="/login" variant="secondary">
            Sign in
          </ButtonLink>
        </div>
      </div>
      <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(([t, d]) => (
          <div key={t} className="rounded-lg border border-border bg-surface p-4">
            <h3 className="font-semibold">{t}</h3>
            <p className="mt-1 text-muted">{d}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
