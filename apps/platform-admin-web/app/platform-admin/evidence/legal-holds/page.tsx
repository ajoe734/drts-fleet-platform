"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { PLATFORM_ADMIN_BOOTSTRAP_ACTOR_ID } from "@/lib/platform-admin-client-factory";
import {
  legalHoldStatusTone,
  loadSandboxComplianceOverview,
  manifestHref,
  type SandboxComplianceOverview,
} from "@/lib/sandbox-compliance";
import type { SandboxLegalHoldRecord } from "@drts/contracts";
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

type HoldRow = SandboxLegalHoldRecord;

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
  caseId: "",
  manifestId: "",
  scopeSummary: "3 evidence items + linked investigation record",
  reason: "",
  expiresAt: "",
};

export default function LegalHoldsPage() {
  const client = usePlatformAdminClient();
  const [snapshot, setSnapshot] = useState<SandboxComplianceOverview | null>(null);
  const [form, setForm] = useState(initialForm);
  const [releaseReason, setReleaseReason] = useState<Record<string, string>>({});
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

  const manifestOptions = useMemo(() => {
    return (snapshot?.investigations ?? [])
      .filter((item) => item.evidenceManifestId)
      .map((item) => ({
        caseId: item.caseId,
        manifestId: item.evidenceManifestId ?? "",
      }));
  }, [snapshot]);

  useEffect(() => {
    if (!manifestOptions.length) {
      return;
    }
    setForm((current) => {
      if (current.caseId && current.manifestId) {
        return current;
      }
      return {
        ...current,
        caseId: manifestOptions[0]?.caseId ?? "",
        manifestId: manifestOptions[0]?.manifestId ?? "",
      };
    });
  }, [manifestOptions]);

  const holdRows = snapshot?.legalHolds ?? [];

  async function handlePlaceHold() {
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      await client.placeSandboxLegalHold({
        caseId: form.caseId,
        manifestId: form.manifestId,
        scopeSummary: form.scopeSummary,
        reason: form.reason,
        expiresAt: form.expiresAt || null,
      });
      setNotice("Legal hold placed. Release approval must be performed by a separate actor after request.");
      setForm((current) => ({ ...current, reason: "" }));
      await load();
    } catch (submitError: unknown) {
      setError(submitError instanceof Error ? submitError.message : String(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRequestRelease(row: SandboxLegalHoldRecord) {
    const reason = releaseReason[row.holdId]?.trim();
    if (!reason) {
      setError(`Release reason is required for ${row.holdId}.`);
      return;
    }
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      await client.requestSandboxLegalHoldRelease(row.holdId, {
        releaseReason: reason,
      });
      setNotice(`Release requested for ${row.holdId}.`);
      setReleaseReason((current) => ({ ...current, [row.holdId]: "" }));
      await load();
    } catch (submitError: unknown) {
      setError(submitError instanceof Error ? submitError.message : String(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleApproveRelease(row: SandboxLegalHoldRecord) {
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      await client.approveSandboxLegalHoldRelease(row.holdId, {
        approvalNote: "Approved from platform-admin compliance console.",
      });
      setNotice(`Release approved for ${row.holdId}.`);
      await load();
    } catch (submitError: unknown) {
      setError(submitError instanceof Error ? submitError.message : String(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  const columns: CanvasTableColumn<HoldRow>[] = [
    {
      h: "Hold",
      r: (row) => (
        <div style={{ display: "grid", gap: 2 }}>
          <span style={{ fontWeight: 600 }}>{row.holdId}</span>
          <span style={monoStyle}>{row.scopeSummary}</span>
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
      h: "Status",
      w: 150,
      r: (row) => (
        <CanvasPill theme={theme} tone={legalHoldStatusTone(row.status)} dot>
          {row.status}
        </CanvasPill>
      ),
    },
    {
      h: "Placed",
      w: 150,
      r: (row) => formatDateTime(row.placedAt),
    },
    {
      h: "Release workflow",
      w: 260,
      r: (row) =>
        row.status === "active" ? (
          <div style={{ display: "grid", gap: 8 }}>
            <input
              value={releaseReason[row.holdId] ?? ""}
              onChange={(event) =>
                setReleaseReason((current) => ({
                  ...current,
                  [row.holdId]: event.target.value,
                }))
              }
              placeholder="Release reason"
              style={controlStyle}
            />
            <CanvasBtn
              theme={theme}
              size="xs"
              variant="secondary"
              onClick={() => void handleRequestRelease(row)}
              disabled={submitting}
            >
              Request release
            </CanvasBtn>
          </div>
        ) : row.status === "release_requested" ? (
          row.releaseRequestedByActorId === PLATFORM_ADMIN_BOOTSTRAP_ACTOR_ID ? (
            <CanvasPill theme={theme} tone="warn">
              requester cannot approve
            </CanvasPill>
          ) : (
            <CanvasBtn
              theme={theme}
              size="xs"
              variant="secondary"
              onClick={() => void handleApproveRelease(row)}
              disabled={submitting}
            >
              Approve release
            </CanvasBtn>
          )
        ) : (
          <span style={monoStyle}>{row.releasedByActorId ?? "—"}</span>
        ),
    },
  ];

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title="法律保留 · Legal Hold"
        subtitle="Deletion freeze overrides retention policy until a separate actor approves release"
      />
      <div style={pageBodyStyle}>
        <CanvasBanner
          theme={theme}
          tone="warn"
          icon="lock"
          title="Legal hold overrides retention policy"
          body="Release approval is separated from release request. ROC / ops read-only actors do not receive release scopes."
        />
        {notice ? (
          <CanvasBanner
            theme={theme}
            tone="info"
            icon="info"
            title="Legal hold workflow updated"
            body={notice}
          />
        ) : null}
        {error ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            icon="warn"
            title="Legal hold workflow failed"
            body={error}
          />
        ) : null}

        <div style={heroGridStyle}>
          <CanvasCard theme={theme} title="Create legal hold" subtitle="Freeze evidence deletion for an investigation">
            <div style={formGridStyle}>
              <CanvasField theme={theme} label="Case">
                <select
                  value={form.caseId}
                  onChange={(event) => {
                    const selected = manifestOptions.find(
                      (item) => item.caseId === event.target.value,
                    );
                    setForm((current) => ({
                      ...current,
                      caseId: event.target.value,
                      manifestId: selected?.manifestId ?? "",
                    }));
                  }}
                  style={controlStyle}
                >
                  {manifestOptions.map((item) => (
                    <option key={item.caseId} value={item.caseId}>
                      {item.caseId}
                    </option>
                  ))}
                </select>
              </CanvasField>
              <CanvasField theme={theme} label="Manifest">
                <select
                  value={form.manifestId}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, manifestId: event.target.value }))
                  }
                  style={controlStyle}
                >
                  {manifestOptions.map((item) => (
                    <option key={item.manifestId} value={item.manifestId}>
                      {item.manifestId}
                    </option>
                  ))}
                </select>
              </CanvasField>
              <CanvasField theme={theme} label="Scope summary">
                <input
                  value={form.scopeSummary}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, scopeSummary: event.target.value }))
                  }
                  style={controlStyle}
                />
              </CanvasField>
              <CanvasField theme={theme} label="Expiry (optional)">
                <input
                  type="datetime-local"
                  value={form.expiresAt}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, expiresAt: event.target.value }))
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
            <div style={{ marginTop: 14 }}>
              <CanvasBtn
                theme={theme}
                variant="primary"
                onClick={() => void handlePlaceHold()}
                disabled={submitting || !form.caseId || !form.manifestId || !form.reason.trim()}
              >
                {submitting ? "Submitting..." : "Place legal hold"}
              </CanvasBtn>
            </div>
          </CanvasCard>

          <CanvasCard theme={theme} title="Current actor" subtitle="Scope separation">
            <CanvasDL
              theme={theme}
              cols={1}
              items={[
                { k: "Actor", v: PLATFORM_ADMIN_BOOTSTRAP_ACTOR_ID, mono: true },
                {
                  k: "Active holds",
                  v: String(holdRows.filter((item) => item.status === "active").length),
                  mono: true,
                },
                {
                  k: "Pending approvals",
                  v: String(
                    holdRows.filter((item) => item.status === "release_requested").length,
                  ),
                  mono: true,
                },
              ]}
            />
          </CanvasCard>
        </div>

        <CanvasCard theme={theme} title="Hold queue" subtitle="Active and pending release workflow" padding={0}>
          {holdRows.length > 0 ? (
            <CanvasTable theme={theme} columns={columns} rows={holdRows} />
          ) : (
            <div style={emptyStateStyle}>
              {loading ? "Loading legal holds..." : "No legal hold has been placed yet."}
            </div>
          )}
        </CanvasCard>
      </div>
    </>
  );
}
