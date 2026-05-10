import type {
  DispatchJobRecord,
  ForwardedOrderRecord,
  OwnedOrderRecord,
} from "@drts/contracts";
import { managementSurfaceTone } from "@drts/ui-web";
import type { CSSProperties } from "react";

export type DispatchView = "owned" | "forwarded" | "governance" | "no_supply";

export type OwnedDispatchBoardMode = Exclude<DispatchView, "forwarded">;
export const DISPATCH_VIEW_ORDER: DispatchView[] = [
  "owned",
  "forwarded",
  "governance",
  "no_supply",
];

export function resolveDispatchView(value: string | undefined): DispatchView {
  switch (value) {
    case "forwarded":
      return "forwarded";
    case "governance":
      return "governance";
    case "no_supply":
      return "no_supply";
    default:
      return "owned";
  }
}

export function getDispatchViewHref(view: DispatchView): string {
  switch (view) {
    case "forwarded":
      return "/dispatch?view=forwarded";
    case "governance":
      return "/dispatch?view=governance";
    case "no_supply":
      return "/dispatch?view=no_supply";
    default:
      return "/dispatch?view=owned";
  }
}

export function getDispatchViewLabelKey(view: DispatchView): string {
  switch (view) {
    case "forwarded":
      return "dispatch.view.forwarded";
    case "governance":
      return "dispatch.view.governance";
    case "no_supply":
      return "dispatch.view.noSupply";
    default:
      return "dispatch.view.owned";
  }
}

export function toOwnedDispatchBoardMode(
  view: DispatchView,
): OwnedDispatchBoardMode {
  switch (view) {
    case "governance":
      return "governance";
    case "no_supply":
      return "no_supply";
    default:
      return "owned";
  }
}

export function isGovernanceScopedOrder(
  order: OwnedOrderRecord,
  job?: DispatchJobRecord,
): boolean {
  return Boolean(
    order.exceptionHold ||
    order.manualFareOverride ||
    order.status === "exception_hold" ||
    order.status === "dispatch_timeout" ||
    order.queueFamily === "manual_review_queue" ||
    job?.status === "timed_out",
  );
}

export function isNoSupplyScopedOrder(
  order: OwnedOrderRecord,
  job?: DispatchJobRecord,
): boolean {
  return Boolean(
    order.status === "no_supply" ||
    order.status === "delayed_queue" ||
    order.noSupplyEscalation ||
    job?.status === "no_supply",
  );
}

export function matchesOwnedDispatchBoardMode(
  order: OwnedOrderRecord,
  mode: OwnedDispatchBoardMode,
  job?: DispatchJobRecord,
): boolean {
  switch (mode) {
    case "governance":
      return isGovernanceScopedOrder(order, job);
    case "no_supply":
      return isNoSupplyScopedOrder(order, job);
    default:
      return true;
  }
}

export function needsForwardedAttention(order: ForwardedOrderRecord): boolean {
  return (
    order.status === "accept_pending" ||
    order.status === "sync_failed" ||
    order.manualFallback.required ||
    order.reconciliationJob?.status === "queued"
  );
}

export function getForwardedRowStyle(
  order: ForwardedOrderRecord,
  active: boolean,
): CSSProperties {
  const forwardedTone = managementSurfaceTone("forwarded");
  const warningTone = managementSurfaceTone("warning");
  const dangerTone = managementSurfaceTone("danger");
  const attention = needsForwardedAttention(order);
  const rowAccent =
    order.status === "sync_failed" || order.manualFallback.required
      ? dangerTone
      : attention
        ? warningTone
        : forwardedTone;

  return {
    cursor: "pointer",
    background: forwardedTone.background,
    borderBottom: `1px solid ${
      active ? forwardedTone.border : rowAccent.border
    }`,
    boxShadow: `inset 4px 0 0 ${active ? forwardedTone.text : rowAccent.border}`,
  };
}
