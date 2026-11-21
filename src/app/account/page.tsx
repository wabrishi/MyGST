import Link from "next/link";
import { CenteredShell } from "@/components/centered-shell";
import { Alert, Avatar, Card } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMobile } from "@/lib/phone";
import { ProfileForm } from "./profile-form";

export const metadata = { title: "My profile" };

/** The signed-in user's profile: name, email and mobile number. */
export default async function AccountPage() {
  const session = await requireUser();
  const user = await db.user.findUniqueOrThrow({ where: { id: session.id }, select: { name: true, email: true, phone: true, createdAt: true } });
  return (
    <CenteredShell>
      <Link href="/companies" className="text-xs text-primary hover:underline">
        ← Back to the app
      </Link>
      <div className="mb-6 mt-3 flex items-center gap-4">
        <Avatar name={user.name} size={52} />
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">My profile</h1>
          <p className="truncate text-sm text-muted">
            {user.email}
            {user.phone && ` · ${formatMobile(user.phone)}`} · member since {user.createdAt.toISOString().slice(0, 10)}
          </p>
        </div>
      </div>
      {!user.phone && (
        <div className="mb-4">
          <Alert kind="info">Add your mobile number so your team can reach you.</Alert>
        </div>
      )}
      <Card className="p-6">
        <ProfileForm name={user.name} email={user.email} phone={formatMobile(user.phone)} />
      </Card>
    </CenteredShell>
  );
}
