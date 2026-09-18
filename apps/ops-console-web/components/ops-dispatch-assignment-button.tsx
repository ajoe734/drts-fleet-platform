"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { DispatchCandidate } from "@drts/contracts";
import { CanvasBtn as Btn, buildCanvasTheme } from "@drts/ui-web";
import { getOpsClient } from "@/lib/api-client";
import { t, type Locale } from "@/lib/translations";

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

type DispatchAssignmentResponse = {
  assignmentId: string;
  status: string;
  taskId: string;
};

export function OpsDispatchAssignmentButton({
  dispatchJobId,
  candidate,
  locale,
}: {
  dispatchJobId: string;
  candidate: DispatchCandidate;
  locale: Locale;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function assignCandidate() {
    startTransition(async () => {
      try {
        setError(null);
        await getOpsClient().post<DispatchAssignmentResponse>(
          "/api/dispatch/assign",
          {
            body: {
              dispatchJobId,
              vehicleId: candidate.vehicleId,
              driverId: candidate.driverId,
            },
          },
        );
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    });
  }

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 5 }}>
      <Btn
        theme={theme}
        variant="primary"
        icon="check"
        disabled={isPending}
        data-drt-operation="ops-dispatch-assign"
        onClick={assignCandidate}
      >
        {isPending
          ? t("avFallback.actions.pending", locale)
          : t("dispatch.detail.headerAction.assignTopCandidate", locale)}
      </Btn>
      {error ? (
        <span role="alert" style={{ color: theme.danger, fontSize: 11 }}>
          {error}
        </span>
      ) : null}
    </span>
  );
}
