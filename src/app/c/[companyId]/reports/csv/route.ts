import { notFound } from "next/navigation";
import { fyLabel, selectedFyRange } from "@/lib/fy-context";
import { financialYear } from "@/lib/gst/fy";
import { AGE_BUCKETS, ageing, partyLedger, purchaseRegister, salesRegister } from "@/lib/reports/books";
import { rs, toCsv, gstDate } from "@/lib/reports/csv";
import { GSTR1_CSV, gstr1, type Gstr1 } from "@/lib/reports/gst-returns";
import { rangeFrom } from "@/lib/range";
import { ForbiddenError, requireCompany } from "@/lib/tenant";

export async function GET(request: Request, { params }: RouteContext<"/c/[companyId]/reports/csv">) {
  const { companyId } = await params;
  let ctx;
  try {
    ctx = await requireCompany(companyId, "reports.view");
  } catch (e) {
    if (e instanceof ForbiddenError) return new Response("Forbidden", { status: 403 });
    throw e;
  }
  const url = new URL(request.url);
  const sp = Object.fromEntries(url.searchParams);
  const [from, to] = rangeFrom(sp, await selectedFyRange(ctx.companyId));
  const period = `${from}_to_${to}`;
  let csv: string;
  let name: string;

  switch (sp.report) {
    case "gstr1": {
      const section = sp.section as keyof Gstr1;
      if (!(section in GSTR1_CSV)) notFound();
      const data = await gstr1(ctx.companyId, from, to);
      const spec = GSTR1_CSV[section] as { cols: Parameters<typeof toCsv>[1] };
      csv = toCsv(data[section] as unknown[], spec.cols);
      name = `GSTR1_${section}_${period}`;
      break;
    }
    case "sales": {
      const rows = await salesRegister(ctx.companyId, from, to);
      csv = toCsv(rows, [
        { header: "Date", value: (r) => gstDate(r.date) },
        { header: "Type", value: (r) => r.type },
        { header: "Number", value: (r) => r.number },
        { header: "Status", value: (r) => r.status },
        { header: "Party", value: (r) => r.party },
        { header: "GSTIN", value: (r) => r.gstin },
        { header: "Place of supply", value: (r) => r.pos },
        { header: "Taxable", value: (r) => rs(r.taxable) },
        { header: "CGST", value: (r) => rs(r.cgst) },
        { header: "SGST", value: (r) => rs(r.sgst) },
        { header: "IGST", value: (r) => rs(r.igst) },
        { header: "Total", value: (r) => rs(r.total) },
      ]);
      name = `Sales_register_${period}`;
      break;
    }
    case "purchases": {
      const rows = await purchaseRegister(ctx.companyId, from, to);
      csv = toCsv(rows, [
        { header: "Date", value: (r) => gstDate(r.date) },
        { header: "Bill number", value: (r) => r.number },
        { header: "Supplier", value: (r) => r.party },
        { header: "GSTIN", value: (r) => r.gstin },
        { header: "ITC", value: (r) => r.itc },
        { header: "Reverse charge", value: (r) => (r.reverseCharge ? "Y" : "N") },
        { header: "Cancelled", value: (r) => (r.cancelled ? "Y" : "N") },
        { header: "Taxable", value: (r) => rs(r.taxable) },
        { header: "CGST", value: (r) => rs(r.cgst) },
        { header: "SGST", value: (r) => rs(r.sgst) },
        { header: "IGST", value: (r) => rs(r.igst) },
        { header: "Total", value: (r) => rs(r.total) },
      ]);
      name = `Purchase_register_${period}`;
      break;
    }
    case "ageing": {
      const side = sp.side === "payable" ? "payable" : "receivable";
      const data = await ageing(ctx.companyId, side);
      csv = toCsv(data.rows, [
        { header: "Party", value: (r) => r.name },
        ...AGE_BUCKETS.map((b, i) => ({ header: b, value: (r: (typeof data.rows)[number]) => rs(r.buckets[i]) })),
        { header: "Total", value: (r) => rs(r.total) },
      ]);
      name = `Ageing_${side}`;
      break;
    }
    case "ledger": {
      const ledger = sp.party ? await partyLedger(ctx.companyId, sp.party, from, to) : null;
      if (!ledger) notFound();
      const rows = [
        { date: from, kind: "Opening balance", ref: "", debit: 0, credit: 0, balance: ledger.opening },
        ...ledger.entries,
        { date: to, kind: "Closing balance", ref: "", debit: ledger.totals.debit, credit: ledger.totals.credit, balance: ledger.closing },
      ];
      csv = toCsv(rows, [
        { header: "Date", value: (r) => gstDate(r.date) },
        { header: "Particulars", value: (r) => r.kind },
        { header: "Ref", value: (r) => r.ref },
        { header: "Debit", value: (r) => (r.debit ? rs(r.debit) : "") },
        { header: "Credit", value: (r) => (r.credit ? rs(r.credit) : "") },
        { header: "Balance", value: (r) => `${rs(Math.abs(r.balance))} ${r.balance >= 0 ? "Dr" : "Cr"}` },
      ]);
      name = `Ledger_${ledger.party.name.replace(/[^A-Za-z0-9]+/g, "_")}_${fyLabel(financialYear(from)).replace(/\s/g, "")}`;
      break;
    }
    default:
      notFound();
  }

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
