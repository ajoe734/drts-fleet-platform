"use client";

import { useState, useTransition } from "react";
import { createIdempotencyKey } from "@drts/api-client";
import { createReportJob, refreshReports } from "./actions";

export function ReportCreateForm({
  canWriteReports,
}: {
  canWriteReports: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    createIdempotencyKey("tenant-report-job"),
  );

  async function handleAction(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await createReportJob(formData);
        // Reset key only upon successful creation so next intent has a new key
        setIdempotencyKey(createIdempotencyKey("tenant-report-job"));
      } catch (err) {
        // Keep the exact same idempotencyKey on failure so retries are idempotent
        setError(
          err instanceof Error ? err.message : "Failed to create report job",
        );
      }
    });
  }

  return (
    <div>
      {error && (
        <div className="error-banner" style={{ marginBottom: 12 }}>
          <strong>Submit failed:</strong> {error}
        </div>
      )}
      <form
        action={handleAction}
        className="form-inline"
        style={{ marginBottom: 16 }}
      >
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
        <label htmlFor="jobType" style={{ marginRight: 8 }}>
          Job Type
        </label>
        <select
          id="jobType"
          name="jobType"
          defaultValue="dispatch_recording_index"
          style={{ marginRight: 16 }}
        >
          <option value="dispatch_recording_index">
            dispatch_recording_index
          </option>
          <option value="revenue_summary">revenue_summary</option>
        </select>
        <label htmlFor="format" style={{ marginRight: 8 }}>
          Format
        </label>
        <select
          id="format"
          name="format"
          defaultValue="csv"
          style={{ marginRight: 16 }}
        >
          <option value="csv">csv</option>
          <option value="xlsx">xlsx</option>
          <option value="pdf">pdf</option>
          <option value="zip">zip</option>
        </select>
        <button type="submit" disabled={!canWriteReports || isPending}>
          {isPending ? "Submitting..." : "Create Job"}
        </button>
        <button
          type="button"
          onClick={() =>
            startTransition(async () => {
              await refreshReports();
            })
          }
          disabled={isPending}
          style={{ marginLeft: 8 }}
        >
          Refresh
        </button>
      </form>
    </div>
  );
}
