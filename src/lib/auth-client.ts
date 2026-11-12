"use client";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();

/** AUTH_MODE=hub: start single sign-on through the suite Hub (genericOAuth provider "hub" = a social provider). */
export async function signInWithHub(callbackURL: string) {
  const { data, error } = await authClient.signIn.social({ provider: "hub", callbackURL, errorCallbackURL: "/login?error=1", disableRedirect: true });
  if (error || !data?.url) throw new Error(error?.message || "Couldn't reach the sign-in service");
  window.location.assign(data.url);
}

/** Ends the MyGST session; in hub mode also signs out of the Hub (`hubLogoutUrl`), else goes to /login. */
export async function signOutEverywhere(hubLogoutUrl?: string | null) {
  await authClient.signOut();
  window.location.assign(hubLogoutUrl || "/login");
}
