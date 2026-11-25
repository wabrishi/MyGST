import Link from "next/link";
import { BRAND } from "@/lib/site";
import { ContactLine, LegalPage } from "../legal";

export const metadata = {
  title: "Privacy policy",
  description: `How ${BRAND} collects, uses, stores and protects your information, including data from your Google account.`,
};

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Privacy policy"
      updated="25 November 2026"
      intro={
        <p>
          {BRAND} is GST billing and accounting software for Indian businesses. This policy explains what information we collect, why, how we keep it safe
          and the choices you have. By using {BRAND} you agree to this policy.
        </p>
      }
    >
      <h2>1. Information we collect</h2>
      <h3>Account information</h3>
      <p>Your name, email address, mobile number (if you give it) and a securely hashed password, or your sign-in details if you sign in with a single sign-on provider.</p>
      <h3>Business data you enter</h3>
      <p>
        Your company details (such as legal name, GSTIN, address and bank details), customers and suppliers, products, quotations, invoices, purchases,
        payments, credit and debit notes and the GST return data built from them. This is your data: we process it only to provide the service to you.
      </p>
      <h3>Technical information</h3>
      <p>Basic logs such as IP address, browser type, sign-in times and actions taken, used to keep your account secure, keep an audit trail and fix problems.</p>
      <h3>Messages you send us</h3>
      <p>What you write in our contact form or emails, so we can reply.</p>

      <h2>2. How we use your information</h2>
      <ul>
        <li>To run {BRAND}: create documents, work out GST, produce reports and returns, and send the emails you ask us to send (such as invoices to your customers).</li>
        <li>To send account emails: email verification, password resets, team invitations and notices about documents shared with your company.</li>
        <li>To keep the service secure, prevent misuse and meet legal obligations.</li>
        <li>To answer your questions and improve the product.</li>
      </ul>
      <p>We do not sell your information, and we do not use your business data for advertising.</p>

      <h2>3. Google user data</h2>
      <p>
        {BRAND} lets you back up your books to your own Google Drive. If you connect Google Drive, we ask Google for these permissions only:
      </p>
      <ul>
        <li>
          <b>See, edit, create and delete only the specific Google Drive files that {BRAND} creates</b> (<code>drive.file</code>). We use this to save backup
          files to your Drive, list the backups {BRAND} made, and remove old {BRAND} backups. We cannot see any other files in your Drive.
        </li>
        <li>
          <b>Your email address and basic profile</b> (<code>openid</code>, <code>email</code>), so we can show which Google account the backups go to.
        </li>
      </ul>
      <p>
        We store the access tokens Google gives us encrypted, and use them only to make and manage your backups. Google user data is never sold, never used
        for advertising, never used to train AI models, and never shared with anyone except as needed to provide this backup feature, to comply with the law,
        or with your consent. No person at {BRAND} reads your Drive data unless you ask us to help with a backup problem.
      </p>
      <p>
        {BRAND}&apos;s use and transfer of information received from Google APIs adheres to the{" "}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements.
      </p>
      <p>
        You can disconnect Google Drive at any time from your backup settings in {BRAND}, or remove {BRAND}&apos;s access at{" "}
        <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">
          myaccount.google.com/permissions
        </a>
        . Backups already saved stay in your Drive until you delete them.
      </p>

      <h2>4. Sharing</h2>
      <p>We share information only:</p>
      <ul>
        <li>With people you choose: team members you invite, and customers or suppliers you send documents to.</li>
        <li>
          With other companies on {BRAND}, when you issue a document to a party whose GSTIN belongs to a {BRAND} company. They receive that document in
          their inbox, the same as if you had emailed it.
        </li>
        <li>With service providers that help us run {BRAND} (such as hosting and email delivery), who may use it only for that purpose.</li>
        <li>When required by law, or to protect the rights and safety of our users and {BRAND}.</li>
      </ul>

      <h2>5. Storage and security</h2>
      <p>
        Your data is stored on secure servers. Connections are encrypted (HTTPS), passwords are hashed, each company&apos;s data is kept separate, and access
        inside a company is controlled by roles. No system is perfectly secure, but we work to protect your information and will tell you if a breach
        affects you.
      </p>

      <h2>6. How long we keep data</h2>
      <p>
        We keep your data while your account is active. Business records may need to be kept for the period required under GST and other Indian laws. If you
        close your account, we delete or anonymise your data within a reasonable time, except where the law requires us to keep it.
      </p>

      <h2>7. Your choices and rights</h2>
      <ul>
        <li>See and correct your account details in your account settings.</li>
        <li>Export your company&apos;s data at any time.</li>
        <li>Disconnect Google Drive or other connected services.</li>
        <li>Ask us for a copy of your personal data, or to delete it, subject to legal record-keeping requirements.</li>
      </ul>
      <p>
        We handle personal data in line with India&apos;s Digital Personal Data Protection Act, 2023 and the Information Technology Act, 2000.
      </p>

      <h2>8. Cookies</h2>
      <p>We use only the cookies needed to keep you signed in and secure. We do not use advertising or tracking cookies.</p>

      <h2>9. Children</h2>
      <p>{BRAND} is a business tool and is not meant for anyone under 18.</p>

      <h2>10. Changes to this policy</h2>
      <p>If we change this policy, we will update the date above and, for important changes, tell you by email or in the app.</p>

      <h2>11. Contact us</h2>
      <p>For privacy questions or requests:</p>
      <ContactLine />
      <p>
        See also our <Link href="/terms">terms of service</Link>.
      </p>
    </LegalPage>
  );
}
