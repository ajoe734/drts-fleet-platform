"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { usePlatformAdminClient } from "@/lib/admin-client";
import { PLATFORM_ADMIN_BOOTSTRAP_ACTOR_ID } from "@/lib/platform-admin-client-factory";
import {
  exportStatusTone,
  loadSandboxComplianceOverview,
  manifestHref,
  truncateHash,
  uniqueManifestIds,
  type SandboxComplianceOverview,
} from "@/lib/sandbox-compliance";
import type { SandboxControlledEvidenceExportRecord } from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasField,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  buildCanvasTheme,
  type CanvasTableColumn,
} from "@drts/ui-web";

type ExportRow = SandboxControlledEvidenceExportRecord;

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "grid",
  gap: 16,
  width: "100%",
  maxWidth: 1280,
  margin: "0 auto",
};

const heroGridStyle: CSSProperties = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "minmax(0, 1.1fr) minmax(320px, 0.9fr)",
  alignItems: "start",
};

const formGridStyle: CSSProperties = {
  display: "grid",
  gap: 14,
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
};

const controlStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: theme.surface,
  color: theme.text,
  padding: "10px 12px",
  font: "inherit",
};

const textAreaStyle: CSSProperties = {
  ...controlStyle,
  minHeight: 96,
  resize: "vertical",
} satisfies CSSProperties;

const emptyStateStyle: CSSProperties = {
  color: theme.textMuted,
  fontSize: 12.5,
  padding: "28px 16px",
  textAlign: "center",
};

const monoStyle: CSSProperties = {
  fontFamily: theme.monoFamily,
  fontSize: 11.5,
};

const linkStyle: CSSProperties = {
  color: theme.accent,
  textDecoration: "none",
  fontWeight: 600,
  fontSize: 12.5,
};

const initialForm = {
  manifestId: "",
  caseId: "",
  reportId: "",
  recipientLabel: "Taipei City Transportation Department",
  recipientScope: "regulator.viewer.taipei_city",
  reason: "",
};

export default function ControlledExportsPage() {
  const client = usePlatformAdminClient();
  const [snapshot, setSnapshot] = useState<SandboxComplianceOverview | null>(null);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const result = await loadSandboxComplianceOverview(client);
      setSnapshot(result);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [client]);

  const manifestOptions = useMemo<Array<{ manifestId: string; caseId: string }>>(() => {
    const investigations = snapshot?.investigations ?? [];
    const ids = uniqueManifestIds(investigations);
    return ids.map((manifestId) => ({
      manifestId,
      caseId:
        investigations.find((item) => item.evidenceManifestId === manifestId)?.caseId ??
        "",
    }));
  }, [snapshot]);

  useEffect(() => {
    if (!manifestOptions.length) {
      return;
    }
    setForm((current) => {
      if (current.manifestId) {
        return current;
      }
      return {
        ...current,
        manifestId: manifestOptions[0]?.manifestId ?? "",
        caseId: manifestOptions[0]?.caseId ?? "",
      };
    });
  }, [manifestOptions]);

  const reportOptions = snapshot?.regulatoryReports ?? [];
  const exportRows = snapshot?.controlledExports ?? [];

  async function handleRequest() {
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      await client.requestSandboxControlledExport({
        manifestId: form.manifestId,
        caseId: form.caseId || null,
        reportId: form.reportId || null,
        recipientLabel: form.recipientLabel,
        recipientScope: form.recipientScope,
        reason: form.reason,
      });
      setNotice("Controlled export request submitted. Approval requires a different actor.");
      setForm((current) => ({ ...current, reason: "" }));
      await load();
    } catch (submitError: unknown) {
      setError(submitError instanceof Error ? submitError.message : String(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleApprove(row: SandboxControlledEvidenceExportRecord) {
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      await client.approveSandboxControlledExport(row.exportRequestId, {
        approvalNote: "Approved from platform-admin compliance console.",
      });
      setNotice(`Controlled export ${row.exportRequestId} approved.`);
      await load();
    } catch (approveError: unknown) {
      setError(approveError instanceof Error ? approveError.message : String(approveError));
    } finally {
      setSubmitting(false);
    }
  }

  const columns: CanvasTableColumn<ExportRow>[] = [
    {
      h: "Export",
      r: (row) => (
        <div style={{ display: "grid", gap: 2 }}>
          <span style={{ fontWeight: 600 }}>{row.exportRequestId}</span>
          <span style={monoStyle}>{row.recipientLabel}</span>
        </div>
      ),
    },
    {
      h: "Manifest",
      w: 150,
      r: (row) => (
        <Link href={manifestHref(row.manifestId)} style={linkStyle}>
          {row.manifestId}
        </Link>
      ),
    },
    {
      h: "Checksum",
      w: 140,
      r: (row) => <span style={monoStyle}>{truncateHash(row.artifactChecksumSha256, 14)}</span>,
    },
    {
      h: "Status",
      w: 140,
      r: (row) => (
        <CanvasPill theme={theme} tone={exportStatusTone(row.status)} dot>
          {row.status}
        </CanvasPill>
      ),
    },
    {
      h: "Dual control",
      w: 180,
      r: (row) =>
        row.requestedByActorId === PLATFORM_ADMIN_BOOTSTRAP_ACTOR_ID ? (
          <CanvasPill theme={theme} tone="warn">
            requester cannot approve
          </CanvasPill>
        ) : row.status === "pending_approval" ? (
          <CanvasBtn
            theme={theme}
            size="xs"
            variant="secondary"
            onClick={() => void handleApprove(row)}
            disabled={submitting}
          >
            Approve
          </CanvasBtn>
        ) : (
          <span style={monoStyle}>{row.approvedByActorId ?? "—"}</span>
        ),
    },
  ];

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title="受控匯出 · Controlled Export"
        subtitle="Evidence export requests, dual control, and append-only audit receipts"
      />
      <div style={pageBodyStyle}>
        <CanvasBanner
          theme={theme}
          tone="accent"
          icon="lock"
          title="Four-eyes separation enforced"
          body="The same actor cannot request and approve the same export. Use a second compliance actor to approve pending requests."
        />
        {notice ? (
          <CanvasBanner
            theme={theme}
            tone="info"
            icon="info"
            title="Export workflow updated"
            body={notice}
          />
        ) : null}
        {error ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            icon="warn"
            title="Controlled export workflow failed"
            body={error}
          />
        ) : null}

        <div style={heroGridStyle}>
          <CanvasCard theme={theme} title="Export request" subtitle="Request sealed evidence delivery">
            <div style={formGridStyle}>
              <CanvasField theme={theme} label="Manifest">
                <select
                  value={form.manifestId}
                  onChange={(event) => {
                    const manifestId = event.target.value;
                    const selected = manifestOptions.find((item) => item.manifestId === manifestId);
                    setForm((current) => ({
                      ...current,
                      manifestId,
                      caseId: selected?.caseId ?? "",
                    }));
                  }}
                  style={controlStyle}
                >
                  {manifestOptions.map((item) => (
                    <option key={item.manifestId} value={item.manifestId}>
                      {item.manifestId}
                    </option>
                  ))}
                </select>
              </CanvasField>
              <CanvasField theme={theme} label="Regulatory report">
                <select
                  value={form.reportId}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, reportId: event.target.value }))
                  }
                  style={controlStyle}
                >
                  <option value="">None</option>
                  {reportOptions.map((item) => (
                    <option key={item.reportId} value={item.reportId}>
                      {item.reportId}
                    </option>
                  ))}
                </select>
              </CanvasField>
              <CanvasField theme={theme} label="Recipient">
                <input
                  value={form.recipientLabel}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, recipientLabel: event.target.value }))
                  }
                  style={controlStyle}
                />
              </CanvasField>
              <CanvasField theme={theme} label="Recipient scope">
                <input
                  value={form.recipientScope}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, recipientScope: event.target.value }))
                  }
                  style={controlStyle}
                />
              </CanvasField>
            </div>
            <div style={{ marginTop: 14 }}>
              <CanvasField theme={theme} label="Reason" required>
                <textarea
                  value={form.reason}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, reason: event.target.value }))
                  }
                  style={textAreaStyle}
                />
              </CanvasField>
            </div>
            <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
              <CanvasBtn
                theme={theme}
                variant="primary"
                onClick={() => void handleRequest()}
                disabled={submitting || !form.manifestId || !form.reason.trim()}
              >
                {submitting ? "Submitting..." : "Request export"}
              </CanvasBtn>
            </div>
          </CanvasCard>

          <CanvasCard theme={theme} title="Dual-control receipt" subtitle="Current actor constraints">
            <CanvasDL
              theme={theme}
              cols={1}
              items={[
                { k: "Current actor", v: PLATFORM_ADMIN_BOOTSTRAP_ACTOR_ID, mono: true },
                {
                  k: "Pending approvals",
                  v: String(exportRows.filter((item) => item.status === "pending_approval").length),
                  mono: true,
                },
                {
                  k: "Manifest choices",
                  v: String(manifestOptions.length),
                  mono: true,
                },
              ]}
            />
          </CanvasCard>
        </div>

        <CanvasCard theme={theme} title="Export queue" subtitle="All controlled evidence export requests" padding={0}>
          {exportRows.length > 0 ? (
            <CanvasTable theme={theme} columns={columns} rows={exportRows} />
          ) : (
            <div style={emptyStateStyle}>
              {loading ? "Loading controlled export queue..." : "No controlled export requests exist yet."}
            </div>
          )}
        </CanvasCard>
      </div>
    </>
  );
}
