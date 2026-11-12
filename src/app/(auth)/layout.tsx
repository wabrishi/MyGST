import { BadgeCheck, FileText, ShieldCheck } from "lucide-react";
import { Logo, LogoMark } from "@/components/brand";

const POINTS = [
  { icon: FileText, title: "GST invoices in seconds", text: "CGST/SGST or IGST applied automatically from the place of supply." },
  { icon: BadgeCheck, title: "Return-ready reports", text: "GSTR-1 and GSTR-3B summaries with offline-tool CSV exports." },
  { icon: ShieldCheck, title: "Your data, protected", text: "Role-based access, closed financial years and automatic backups." },
];

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="grid min-h-screen flex-1 lg:grid-cols-[1fr_1.1fr]">
      {/* Brand panel */}
      <section className="relative hidden overflow-hidden bg-[#1e1b4b] p-12 text-white lg:flex lg:flex-col">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              "radial-gradient(600px circle at 15% 10%, rgb(99 102 241 / 0.55), transparent 60%), radial-gradient(500px circle at 90% 90%, rgb(56 189 248 / 0.25), transparent 60%)",
          }}
        />
        <div className="relative flex items-center gap-2 text-lg font-semibold">
          <LogoMark size={30} />
          MyGST
        </div>
        <div className="relative mt-auto max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">GST billing that keeps your books return-ready.</h2>
          <p className="mt-3 text-[15px] text-indigo-100/80">Invoices, payments, purchases and GST reports for Indian businesses — in one place.</p>
          <ul className="mt-10 space-y-5">
            {POINTS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
                  <Icon size={17} />
                </span>
                <span>
                  <span className="block font-medium">{title}</span>
                  <span className="block text-sm text-indigo-100/70">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative mt-12 text-xs text-indigo-100/50">© {new Date().getFullYear()} MyGST</p>
      </section>

      {/* Form */}
      <section className="flex items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}
