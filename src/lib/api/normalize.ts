/** Digits only, e.g. "+91 98765-43210" -> "919876543210" (the suite's shared phone format). */
export const phoneDigits = (p: string) => p.replace(/\D/g, "");
