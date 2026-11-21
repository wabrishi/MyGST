import Link from "next/link";
import { Alert, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/admin";
import { getSavedSiteContact, getSiteContact } from "@/lib/site-store";
import { WebsiteForm } from "./website-form";

export const metadata = { title: "Website" };

/** Admin → Website: the public website's contact details. */
export default async function AdminWebsitePage() {
  await requireAdmin("website.manage");
  const [saved, effective] = await Promise.all([getSavedSiteContact(), getSiteContact()]);
  // Fields still coming from CONTACT_* environment variables (nothing saved here yet).
  const fromEnv = (Object.keys(saved) as Array<keyof typeof saved>).filter((k) => !saved[k] && effective[k]);

  return (
    <>
      <PageHeader
        title="Website"
        subtitle={
          <>
            Contact details shown on the public website:{" "}
            <Link href="/contact" target="_blank" className="text-primary hover:underline">
              Contact page
            </Link>
            , footer and header.
          </>
        }
      />
      {fromEnv.length > 0 && (
        <div className="mb-4">
          <Alert kind="info">
            Some details currently come from the server&apos;s CONTACT_* settings ({fromEnv.join(", ")}). Anything you save here takes their place.
          </Alert>
        </div>
      )}
      <WebsiteForm initial={saved} />
    </>
  );
}
