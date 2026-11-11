"use client";

import { useRouter } from "next/navigation";
import { CompanyForm, type CompanySection } from "@/components/company-form";
import { useAction } from "@/components/form-utils";
import { Alert, Button } from "@/components/ui";
import type { CompanyInput } from "@/lib/validation";
import { finishSetup, updateCompany } from "../settings/actions";

/** A wizard step that edits part of the company record, then moves to the next step. */
export function CompanyStep({
  companyId,
  sections,
  initial,
  nextHref,
}: {
  companyId: string;
  sections: CompanySection[];
  initial: Partial<CompanyInput>;
  nextHref: string;
}) {
  const router = useRouter();
  return (
    <CompanyForm
      action={updateCompany.bind(null, companyId)}
      sections={sections}
      initial={initial}
      submitLabel="Save & continue"
      onSaved={() => router.push(nextHref)}
    />
  );
}

export function FinishButton({ companyId, ready }: { companyId: string; ready: boolean }) {
  const { execute, pending, error } = useAction(finishSetup.bind(null, companyId));
  return (
    <div className="flex flex-col items-start gap-2">
      {error && <Alert>{error}</Alert>}
      <Button
        disabled={pending}
        onClick={() => {
          if (!ready && !confirm("Some steps are not complete yet. Finish setup anyway? You can complete them later in Settings.")) return;
          execute();
        }}
      >
        {pending ? "Finishing…" : "Finish setup"}
      </Button>
    </div>
  );
}
