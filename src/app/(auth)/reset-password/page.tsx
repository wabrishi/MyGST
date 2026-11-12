import { redirect } from "next/navigation";
import { connection } from "next/server";
import { hubMode, hubUrl } from "@/lib/hub-rules";
import { ResetPage } from "./reset-form";

export const metadata = { title: "Choose a new password" };

// Rendered per request: AUTH_MODE is read at runtime, not baked in at build time.
export default async function Page() {
  await connection();
  if (hubMode()) redirect(`${hubUrl()}/reset-password`);
  return <ResetPage />;
}
