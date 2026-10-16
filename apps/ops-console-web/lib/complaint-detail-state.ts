import type { ApiClient } from "@drts/api-client";
import type { ComplaintCaseRecord } from "@drts/contracts";

export async function loadComplaintTimeline(
  client: Pick<ApiClient, "getComplaintTimeline">,
  caseNo: string,
) {
  return client.getComplaintTimeline(caseNo).catch(() => null);
}

export function complaintProgressStates(status: ComplaintCaseRecord["status"]) {
  const complete = status === "resolved" || status === "closed";
  return {
    opened: "complete" as const,
    triage: status === "new" ? ("current" as const) : ("complete" as const),
    investigation:
      status === "new"
        ? ("upcoming" as const)
        : complete
          ? ("complete" as const)
          : ("current" as const),
    closure:
      status === "closed"
        ? ("complete" as const)
        : status === "resolved"
          ? ("current" as const)
          : ("upcoming" as const),
  };
}
