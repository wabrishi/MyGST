import { Badge } from "@/components/ui";
import { PO_STATUS_LABEL, type PoStatus } from "@/lib/po-status";

const COLOR: Record<PoStatus, "blue" | "amber" | "green" | "gray"> = { OPEN: "blue", PARTIAL: "amber", BILLED: "green", CLOSED: "gray", CANCELLED: "gray" };

/** Purchase order status; overdue open orders get a second red badge. */
export function PoStatusBadge({ status, overdue }: { status: PoStatus; overdue?: boolean }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      <Badge color={COLOR[status]}>{PO_STATUS_LABEL[status]}</Badge>
      {overdue && <Badge color="red">Overdue</Badge>}
    </span>
  );
}
