import Link from "next/link";
import { BRAND } from "@/lib/site";
import { ContactLine, LegalPage } from "../legal";

export const metadata = {
  title: "Terms of service",
  description: `The terms that apply when you use ${BRAND}, GST billing and accounting software for Indian businesses.`,
};

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Terms of service"
      updated="25 November 2026"
      intro={
        <p>
          These terms apply when you use {BRAND}, our GST billing and accounting software and website. By creating an account or using {BRAND}, you agree to
          them. If you use {BRAND} for a business, you agree on behalf of that business.
        </p>
      }
    >
      <h2>1. Your account</h2>
      <ul>
        <li>You must be at least 18 and give accurate details when you sign up.</li>
        <li>Keep your password safe. You are responsible for what happens under your account and for the team members you invite.</li>
        <li>Tell us straight away if you think someone else has accessed your account.</li>
      </ul>

      <h2>2. Using {BRAND}</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use {BRAND} for anything illegal, including fake invoices, false GST claims or tax evasion.</li>
        <li>Register a company with a GSTIN that is not yours or that you are not authorised to use.</li>
        <li>Try to access other companies&apos; data, break or overload the service, or get around its security.</li>
        <li>Copy, resell or reverse-engineer {BRAND}, except where the law allows.</li>
        <li>Send spam or harmful content through the email and sharing features.</li>
      </ul>
      <p>We may suspend or close accounts that break these rules.</p>

      <h2>3. Your data</h2>
      <p>
        You own the business data you put into {BRAND}. You give us permission to store and process it only to provide the service, as described in our{" "}
        <Link href="/privacy">privacy policy</Link>. You can export your data at any time.
      </p>

      <h2>4. Tax and accounting responsibility</h2>
      <p>
        {BRAND} helps you work out GST and prepare return data, but it is a tool, not tax or legal advice. You are responsible for the accuracy of what you
        enter, for checking your invoices and returns, and for filing them correctly and on time. Please consult a qualified chartered accountant or tax
        professional for advice about your business.
      </p>

      <h2>5. Plans and payment</h2>
      <ul>
        <li>Some features are free; others need a paid plan, as shown on our <Link href="/pricing">pricing page</Link>.</li>
        <li>Paid plans are billed in advance for the chosen period. Prices are in Indian rupees and GST is added where applicable.</li>
        <li>You can cancel at any time; your plan stays active until the end of the period you paid for. Fees already paid are not refunded unless the law requires it or we agree otherwise.</li>
        <li>We may change prices with advance notice. Changes apply from your next billing period.</li>
      </ul>

      <h2>6. Third-party services and apps</h2>
      <p>
        {BRAND} can connect to services such as Google Drive for backups, and to apps and plugins made by others. Your use of those services is also governed
        by their own terms. We are not responsible for third-party services we do not control.
      </p>

      <h2>7. Availability and backups</h2>
      <p>
        We work to keep {BRAND} available and your data safe, but we cannot promise the service will never be interrupted. We may update, change or stop
        features over time. We recommend you keep backups, for example with the Google Drive backup feature or regular exports.
      </p>

      <h2>8. Limitation of liability</h2>
      <p>
        {BRAND} is provided &quot;as is&quot;. To the extent the law allows, we are not liable for indirect or consequential losses, such as lost profits, lost
        data, penalties or interest, arising from your use of {BRAND}. Our total liability to you for any claim is limited to the fees you paid us in the 12
        months before the claim.
      </p>

      <h2>9. Closing your account</h2>
      <p>
        You can stop using {BRAND} at any time. We may suspend or close an account that breaks these terms, or after giving notice if we stop offering the
        service. Before your account is closed, you can export your data.
      </p>

      <h2>10. Changes to these terms</h2>
      <p>We may update these terms. We will change the date above and, for important changes, tell you by email or in the app. Continuing to use {BRAND} means you accept the updated terms.</p>

      <h2>11. Governing law</h2>
      <p>These terms are governed by the laws of India. Any disputes will be subject to the jurisdiction of the courts in India.</p>

      <h2>12. Contact us</h2>
      <ContactLine />
    </LegalPage>
  );
}
