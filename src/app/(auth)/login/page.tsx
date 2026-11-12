import { connection } from "next/server";
import { hubMode } from "@/lib/hub-rules";
import { safeNext } from "../safe-next";
import { HubLogin } from "./hub-login";
import { LocalLogin } from "./local-login";

export const metadata = { title: "Sign in" };

export default async function Page({ searchParams }: PageProps<"/login">) {
  await connection(); // AUTH_MODE is read at runtime, not baked in at build time
  if (!hubMode()) return <LocalLogin />;
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : null);
  return <HubLogin next={next} error={typeof sp.error === "string" ? sp.error : ""} />;
}
