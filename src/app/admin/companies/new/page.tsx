import { Card, PageHeader } from "@/components/ui";
import { NewCompanyForm } from "./new-company-form";

export const metadata = { title: "New company" };

export default function NewCompanyPage() {
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
