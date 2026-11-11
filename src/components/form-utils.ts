"use client";

import { useState, useTransition } from "react";

type Result<T> = { ok: true; data: T; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** FormData -> plain object; checkboxes become booleans. */
export function formToObject(form: HTMLFormElement): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (const el of Array.from(form.elements) as HTMLInputElement[]) {
    if (!el.name || el.disabled) continue;
    if (el.type === "checkbox") out[el.name] = el.checked;
    else if (el.type === "radio") {
      if (el.checked) out[el.name] = el.value;
    } else out[el.name] = el.value;
  }
  return out;
}

/** Small helper for forms that call a server action returning ActionResult. */
export function useAction<TArgs extends unknown[], T>(action: (...args: TArgs) => Promise<Result<T>>) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const execute = (...args: TArgs) =>
    new Promise<Result<T> | undefined>((resolve) => {
      setError("");
      setMessage("");
      setFieldErrors({});
      startTransition(async () => {
        const res = await action(...args);
        if (res && !res.ok) {
          setError(res.error);
          setFieldErrors(res.fieldErrors ?? {});
        } else if (res?.ok && res.message) setMessage(res.message);
        resolve(res);
      });
    });

  return { execute, pending, error, message, fieldErrors, setError };
}
