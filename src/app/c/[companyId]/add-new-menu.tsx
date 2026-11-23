"use client";

import { ChevronDown, ClipboardList, FileMinus, FilePlus, FileText, HandCoins, Package, Plus, ScrollText, ShoppingCart, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/components/ui";

/** Everything the "+ Add new" menu can create, with the permission each needs. */
const ITEMS: Array<{ group: string; href: string; label: string; icon: LucideIcon; perm: string }> = [
  { group: "Sales", href: "invoices/new", label: "Invoice", icon: FileText, perm: "docs.create" },
  { group: "Sales", href: "quotations/new", label: "Quotation", icon: ScrollText, perm: "docs.create" },
  { group: "Sales", href: "credit-notes/new", label: "Credit note", icon: FileMinus, perm: "docs.create" },
  { group: "Sales", href: "debit-notes/new", label: "Debit note", icon: FilePlus, perm: "docs.create" },
  { group: "Sales", href: "payments/new", label: "Payment", icon: HandCoins, perm: "payments.write" },
  { group: "Purchases", href: "purchase-orders/new", label: "Purchase order", icon: ClipboardList, perm: "purchaseOrders.write" },
  { group: "Purchases", href: "purchases/new", label: "Purchase invoice", icon: ShoppingCart, perm: "purchases.write" },
  { group: "Masters", href: "parties/new", label: "Customer / supplier", icon: Users, perm: "masters.write" },
  { group: "Masters", href: "products/new", label: "Product / service", icon: Package, perm: "masters.write" },
];

/** The top bar's "+ Add new" dropdown: only what this member may create. Hidden when that's nothing. */
export function AddNewMenu({ companyId, perms }: { companyId: string; perms: string[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  if (lastPath !== pathname) {
    // Close after navigating.
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return setOpen(false);
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const items = [...(menuRef.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
      const i = items.indexOf(document.activeElement as HTMLElement);
      items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
      e.preventDefault();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const items = ITEMS.filter((i) => perms.includes(i.perm));
  if (!items.length) return null;
  const groups = [...new Set(items.map((i) => i.group))];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Add new"
        className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground shadow-xs transition-colors hover:bg-primary-hover"
      >
        <Plus size={15} />
        <span className="hidden sm:inline">Add new</span>
        <ChevronDown size={14} className={cn("hidden transition-transform sm:block", open && "rotate-180")} />
      </button>
      {open && (
        <div ref={menuRef} role="menu" aria-label="Add new" className="absolute right-0 top-full z-40 mt-2 w-60 rounded-xl border border-border bg-surface p-1.5 shadow-pop">
          {groups.map((g, gi) => (
            <div key={g} role="group" aria-label={g}>
              {gi > 0 && <div className="my-1 h-px bg-border" />}
              <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted/80">{g}</div>
              {items
                .filter((i) => i.group === g)
                .map(({ href, label, icon: Icon }) => (
                  <Link
                    key={href}
                    role="menuitem"
                    href={`/c/${companyId}/${href}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] text-foreground/85 outline-none hover:bg-subtle hover:text-foreground focus-visible:bg-subtle focus-visible:text-foreground"
                  >
                    <Icon size={15} className="text-muted" />
                    {label}
                  </Link>
                ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
