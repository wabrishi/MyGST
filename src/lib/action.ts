import "server-only";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { ForbiddenError } from "./tenant";
import { isOneCompanyConflict } from "./one-company";

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** Error with a message that is safe to show the user. */
export class UserError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
  }
}

export const ok = <T>(data: T, message?: string): ActionResult<T> => ({ ok: true, data, message });

/**
 * Wraps a server action body: converts validation / permission / known DB errors into a
 * serializable result, and lets Next.js control-flow errors (redirect, notFound) through.
 */
export async function run<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof z.ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of err.issues) {
        const key = issue.path.join(".");
        fieldErrors[key] ??= issue.message;
      }
      return { ok: false, error: err.issues[0]?.message ?? "Invalid input", fieldErrors };
    }
    if (err instanceof UserError) {
      return { ok: false, error: err.message, fieldErrors: err.field ? { [err.field]: err.message } : undefined };
    }
    if (err instanceof ForbiddenError) return { ok: false, error: err.message };
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (isOneCompanyConflict(err)) return { ok: false, error: "This user already belongs to a company. Each user can be part of only one company." };
      if (err.code === "P2002") return { ok: false, error: "A record with the same value already exists." };
      if (err.code === "P2003") return { ok: false, error: "This record is in use and can't be removed." };
      if (err.code === "P2025") return { ok: false, error: "Record not found." };
    }
    console.error(err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
