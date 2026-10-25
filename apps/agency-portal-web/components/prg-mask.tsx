import { Badge } from "@drts/ui-web";

/**
 * Masked-field chip with the PrgMask semantics of the platform-regulator
 * canvas: a value shown here is deliberately masked or withheld, never
 * missing data.
 */
export function PrgMask({ label = "已遮罩" }: { label?: string }) {
  return (
    <Badge variant="orange" style={{ gap: 4 }}>
      <span aria-hidden="true">🔒</span>
      {label}
    </Badge>
  );
}
