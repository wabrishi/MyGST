"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Input } from "./ui";

/** Debounced search input that syncs to the `q` query param. */
export function SearchBox({ placeholder = "Search…", param = "q" }: { placeholder?: string; param?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get(param) ?? "");

  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get(param) ?? "") === value) return;
      const next = new URLSearchParams(params);
      if (value) next.set(param, value);
      else next.delete(param);
      next.delete("page");
      router.replace(`${pathname}?${next}`);
    }, 300);
    return () => clearTimeout(t);
  }, [value, params, param, pathname, router]);

  return <Input type="search" value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} className="max-w-xs" />;
}
