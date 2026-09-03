import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS } from "@/lib/format";
import type { ReviewStatus } from "@/lib/types";

export function StatusBadge({ status }: { status: ReviewStatus }) {
  return <Badge variant={status}>{STATUS_LABELS[status]}</Badge>;
}
