import { Card, PageHeader } from "@/components/ui";
import { redirect } from "next/navigation";
import { hubMode, hubUrl } from "@/lib/hub-rules";
import { NewCompanyForm } from "./new-company-form";

export const metadata = { title: "New company" };

export default function NewCompanyPage() {
  // Hub mode: workspaces (and so companies) are created in the Hub admin.
  if (hubMode()) redirect(`${hubUrl()}/admin`);
  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Create a company"
        subtitle="Enter the basics and the owner's email. The owner completes the rest in the setup wizard after they sign in."
      />
      <Card className="p-5">
        <NewCompanyForm />
      </Card>
    </div>
  );
}
