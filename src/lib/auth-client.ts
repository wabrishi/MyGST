"use client";
import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/** Must match user.additionalFields in src/lib/auth.ts. */
export const authClient = createAuthClient({
  plugins: [inferAdditionalFields({ user: { phone: { type: "string", required: false } } })],
});
