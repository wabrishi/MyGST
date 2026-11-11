import Link from "next/link";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-6 block text-center text-2xl font-bold text-primary">
          MyGST
        </Link>
        <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">{children}</div>
      </div>
    </main>
  );
}
