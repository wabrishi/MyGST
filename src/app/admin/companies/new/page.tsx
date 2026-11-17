import { Card, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/admin";
import { NewCompanyForm } from "./new-company-form";

export const metadata = { title: "New company" };

export default async function NewCompanyPage() {
  await requireAdmin("companies.manage");
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
