import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { Alert, ButtonLink } from "@/components/ui";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { userCompany } from "@/lib/one-company";
import { ROLE_LABEL } from "@/lib/permissions";
import { AcceptButton } from "./accept-button";

export const metadata = { title: "Invitation" };

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);

  const invite = await db.invitation.findUnique({
    where: { tokenHash: createHash("sha256").update(token).digest("hex") },
    include: { company: { select: { legalName: true, tradeName: true } } },
  });

  const current = await userCompany(user.id);

  let body: React.ReactNode;
  if (current && invite && current.id === invite.companyId) {
    body = <Alert kind="info">You are already a member of this company.</Alert>;
  } else if (current) {
    body = (
      <Alert kind="warning">
        You already belong to <b>{current.tradeName || current.legalName}</b>. Each user can be part of only one company, so this invitation
        can&apos;t be accepted with this account. Sign up with a different email, or ask the inviter to use another address.
      </Alert>
    );
  } else if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
    body = <Alert>This invitation is invalid, already used, or has expired. Ask the company owner to send a new one.</Alert>;
  } else if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
    body = (
      <Alert kind="warning">
        This invitation was sent to <b>{invite.email}</b>, but you are signed in as <b>{user.email}</b>. Sign in with the invited email to
        accept it.
      </Alert>
    );
  } else {
    body = (
      <>
        <p>
          You&apos;ve been invited to join <b>{invite.company.tradeName || invite.company.legalName}</b> as{" "}
          <b>{ROLE_LABEL[invite.role]}</b>.
        </p>
        <AcceptButton token={token} />
      </>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-16">
      <h1 className="text-xl font-semibold">Company invitation</h1>
      {body}
      <ButtonLink href="/companies" variant="ghost" className="self-start">
        Go to my companies
      </ButtonLink>
    </main>
  );
}
