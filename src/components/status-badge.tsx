import { Badge } from "./ui";

const MAP: Record<string, [string, "gray" | "green" | "red" | "amber" | "blue"]> = {
  PAID: ["Paid", "green"],
  PARTIAL: ["Partly paid", "amber"],
  UNPAID: ["Unpaid", "blue"],
  OVERDUE: ["Overdue", "red"],
  CANCELLED: ["Cancelled", "gray"],
  ISSUED: ["Issued", "blue"],
  OPEN: ["Open", "blue"],
  ACCEPTED: ["Accepted", "green"],
  CONVERTED: ["Converted", "green"],
  EXPIRED: ["Expired", "gray"],
};

export function StatusBadge({ status }: { status: string }) {
  const [label, color] = MAP[status] ?? [status, "gray"];
  return <Badge color={color}>{label}</Badge>;
}
