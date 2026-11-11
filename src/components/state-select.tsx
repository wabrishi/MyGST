import type { ComponentProps } from "react";
import { STATES } from "@/lib/gst/states";
import { Select } from "./ui";

export function StateSelect({ placeholder = "Select state", ...props }: ComponentProps<"select"> & { placeholder?: string }) {
  return (
    <Select {...props}>
      <option value="">{placeholder}</option>
      {STATES.map(([code, name]) => (
        <option key={code} value={code}>
          {code} - {name}
        </option>
      ))}
    </Select>
  );
}
