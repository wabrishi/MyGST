import Link from "next/link";

export const PAGE_SIZE = 50;

export function pageFrom(sp: Record<string, string | string[] | undefined>) {
  const p = Number(sp.page);
  return Number.isInteger(p) && p > 1 ? p : 1;
}

/** Prev/next links preserving other query params. */
export function Pager({
  page,
  hasMore,
  basePath,
  searchParams,
}: {
  page: number;
  hasMore: boolean;
  basePath: string;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  if (page === 1 && !hasMore) return null;
  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) if (typeof v === "string" && k !== "page") q.set(k, v);
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  return (
    <div className="flex items-center justify-end gap-3 px-3 py-2 text-xs">
      {page > 1 && (
        <Link href={href(page - 1)} className="text-primary hover:underline">
          ← Previous
        </Link>
      )}
      <span className="text-muted">Page {page}</span>
      {hasMore && (
        <Link href={href(page + 1)} className="text-primary hover:underline">
          Next →
        </Link>
      )}
    </div>
  );
}
