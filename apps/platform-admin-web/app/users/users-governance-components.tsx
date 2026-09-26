"use client";

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type CSSProperties,
  type FormEvent,
} from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { useBreakGlass } from "@/components/break-glass-context";
import { ApiClientError } from "@drts/api-client";
import { createPlatformAdminIamClient } from "@/lib/platform-admin-iam-client";
import {
  getSessionGovernanceCopy,
  getBreakGlassCopy,
  getStepUpCopy,
} from "./translations";
import type {
  AccessReviewCampaignRecord,
  AccessReviewEvidenceRecord,
  BreakGlassGrantRecord,
  MaskedSessionSummary,
  PlatformAdminUserRecord,
  PlatformAdminUserRole,
  PrivilegedRoleApprovalRequestRecord,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasField,
  CanvasPill,
  CanvasTable,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });

const controlStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 7,
  border: `1px solid ${theme.border}`,
  background: theme.bgRaised,
  color: theme.text,
  fontFamily: theme.fontFamily,
  fontSize: 12.5,
  padding: "8px 10px",
  outline: "none",
};

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(2, 6, 23, 0.62)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  zIndex: 70,
};

const drawerStyle: CSSProperties = {
  position: "fixed",
  top: 0,
  right: 0,
  bottom: 0,
  width: "min(640px, 90vw)",
  background: theme.bg,
  borderLeft: `1px solid ${theme.border}`,
  boxShadow: "-12px 0 32px rgba(2, 6, 23, 0.35)",
  display: "flex",
  flexDirection: "column",
  zIndex: 80,
  overflowY: "auto",
};

const modalStyle: CSSProperties = {
  width: "min(560px, 100%)",
  maxHeight: "calc(100vh - 48px)",
  overflowY: "auto",
  background: theme.bg,
  border: `1px solid ${theme.border}`,
  borderRadius: 12,
  boxShadow: "0 24px 64px rgba(2, 6, 23, 0.45)",
};

const headerStyle: CSSProperties = {
  padding: "16px 20px",
  borderBottom: `1px solid ${theme.border}`,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 14.5,
  fontWeight: 700,
  color: theme.text,
};

const bodyStyle: CSSProperties = {
  padding: 20,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const footerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  padding: "14px 20px",
  borderTop: `1px solid ${theme.border}`,
};

function statusTone(status: string): CanvasTone {
  if (status === "active" || status === "certified" || status === "approved")
    return "success";
  if (status === "invited" || status === "pending" || status === "requested")
    return "warn";
  if (
    status === "suspended" ||
    status === "revoked" ||
    status === "removed" ||
    status === "overdue"
  )
    return "danger";
  return "neutral";
}

// ── 1. User Detail & Session Inventory Drawer ─────────────────────────────────

export function UserDetailDrawer({
  user,
  onClose,
}: {
  user: PlatformAdminUserRecord;
  onClose: () => void;
}) {
  const rawClient = usePlatformAdminClient();
  const iamClient = useMemo(
    () => createPlatformAdminIamClient(rawClient),
    [rawClient],
  );
  const { t, locale } = useTranslation();
  const copy = useMemo(() => getSessionGovernanceCopy(locale), [locale]);

  const [sessions, setSessions] = useState<MaskedSessionSummary[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [revokingSid, setRevokingSid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    setError(null);
    try {
      const result = await iamClient.listSessions({
        actorId: user.userId,
        includeRevoked: true,
      });
      setSessions(result ?? []);
    } catch (e: unknown) {
      const is403 =
        (e instanceof ApiClientError && e.statusCode === 403) ||
        (typeof e === "object" &&
          e !== null &&
          "statusCode" in e &&
          (e as { statusCode?: number }).statusCode === 403) ||
        (e instanceof Error &&
          (e.message.includes("403") ||
            e.message.includes("AUTH_SCOPE_DENIED") ||
            e.message.includes("AUTH_REALM_DENIED")));
      const message = is403
        ? copy.sessionsReadDenied
        : e instanceof Error
          ? e.message
          : copy.loadFailed;
      setError(message);
    } finally {
      setLoadingSessions(false);
    }
  }, [iamClient, user.userId, copy]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const handleRevoke = async (sid: string) => {
    setRevokingSid(sid);
    setError(null);
    try {
      await iamClient.revokeSession(sid, {
        reason: "admin_manual_revoke",
        isCompromised: true,
      });
      await loadSessions();
    } catch (e: unknown) {
      const is403 =
        (e instanceof ApiClientError && e.statusCode === 403) ||
        (typeof e === "object" &&
          e !== null &&
          "statusCode" in e &&
          (e as { statusCode?: number }).statusCode === 403) ||
        (e instanceof Error &&
          (e.message.includes("403") ||
            e.message.includes("AUTH_SCOPE_DENIED") ||
            e.message.includes("AUTH_REALM_DENIED")));
      const message = is403
        ? copy.sessionsWriteDenied
        : e instanceof Error
          ? e.message
          : copy.revokeFailed;
      setError(message);
    } finally {
      setRevokingSid(null);
    }
  };

  const sessionCols: CanvasTableColumn<
    MaskedSessionSummary & Record<string, unknown>
  >[] = [
    { h: "SESSION ID", k: "sessionId", w: 140, mono: true },
    {
      h: "STATUS",
      w: 100,
      r: (r) => (
        <CanvasPill theme={theme} tone={statusTone(r.status)} dot>
          {r.status}
        </CanvasPill>
      ),
    },
    {
      h: "AUTH TIME",
      w: 150,
      mono: true,
      r: (r) => formatDateTime(r.authTime),
    },
    {
      h: "EXPIRES AT",
      w: 150,
      mono: true,
      r: (r) => formatDateTime(r.absoluteExpiresAt),
    },
    {
      h: "ACTIONS",
      w: 120,
      r: (r) =>
        r.status === "active" ? (
          <CanvasBtn
            theme={theme}
            size="xs"
            variant="secondary"
            danger
            disabled={revokingSid === r.sessionId}
            onClick={() => void handleRevoke(r.sessionId)}
          >
            {revokingSid === r.sessionId ? "Revoking…" : "Revoke"}
          </CanvasBtn>
        ) : (
          <span style={{ fontSize: 11, color: theme.textDim }}>Revoked</span>
        ),
    },
  ];

  return (
    <div style={drawerStyle} role="dialog" aria-modal="true">
      <div style={headerStyle}>
        <div>
          <h2 style={titleStyle}>{user.displayName}</h2>
          <div
            style={{
              fontSize: 11.5,
              color: theme.textMuted,
              fontFamily: theme.monoFamily,
              marginTop: 2,
            }}
          >
            {user.email} · {user.userId}
          </div>
        </div>
        <CanvasBtn theme={theme} variant="ghost" onClick={onClose}>
          ✕
        </CanvasBtn>
      </div>

      <div style={bodyStyle}>
        {error ? (
          <CanvasBanner theme={theme} tone="danger" icon="warn" title={error} />
        ) : null}

        <CanvasCard
          theme={theme}
          title={t("users.governance.detail.accountTitle")}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              fontSize: 12.5,
            }}
          >
            <div>
              <span style={{ color: theme.textMuted }}>
                {t("users.governance.detail.roleBindingLabel")}
              </span>{" "}
              <CanvasPill theme={theme} tone="info">
                {user.roleCode}
              </CanvasPill>
            </div>
            <div>
              <span style={{ color: theme.textMuted }}>Status:</span>{" "}
              <CanvasPill theme={theme} tone={statusTone(user.status)} dot>
                {user.status}
              </CanvasPill>
            </div>
            <div>
              <span style={{ color: theme.textMuted }}>Updated:</span>{" "}
              <span style={{ fontFamily: theme.monoFamily }}>
                {formatDateTime(user.updatedAt)}
              </span>
            </div>
            <div>
              <span style={{ color: theme.textMuted }}>
                {t("users.governance.detail.mfaStatusLabel")}
              </span>{" "}
              <CanvasPill theme={theme} tone="success" dot>
                AAL2 Enforced
              </CanvasPill>
            </div>
          </div>
        </CanvasCard>

        <CanvasCard
          theme={theme}
          title={t("users.governance.detail.sessionsTitle")}
          subtitle="Durable server-authoritative session inventory"
          actions={
            <CanvasBtn
              theme={theme}
              size="xs"
              variant="secondary"
              onClick={() => void loadSessions()}
            >
              Refresh
            </CanvasBtn>
          }
        >
          {loadingSessions ? (
            <div
              style={{
                padding: 16,
                textAlign: "center",
                color: theme.textMuted,
              }}
            >
              {t("users.governance.detail.sessionsLoading")}
            </div>
          ) : error ? (
            <div style={{ padding: 16 }}>
              <CanvasBanner
                theme={theme}
                tone="danger"
                icon="warn"
                title={error}
              />
            </div>
          ) : sessions.length === 0 ? (
            <div
              style={{
                padding: 16,
                textAlign: "center",
                color: theme.textMuted,
              }}
            >
              {t("users.governance.detail.sessionsEmpty")}
            </div>
          ) : (
            <CanvasTable
              theme={theme}
              columns={sessionCols}
              rows={sessions.map((s) => ({ ...s }))}
            />
          )}
        </CanvasCard>
      </div>
    </div>
  );
}

// ── 2. Privileged Role Request & Approval Panel ───────────────────────────────

export function RoleApprovalPanel() {
  const rawClient = usePlatformAdminClient();
  const iamClient = useMemo(
    () => createPlatformAdminIamClient(rawClient),
    [rawClient],
  );
  const { t, locale } = useTranslation();
  const stepUpCopy = useMemo(() => getStepUpCopy(locale), [locale]);

  const [requests, setRequests] = useState<
    PrivilegedRoleApprovalRequestRecord[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Create form state
  const [targetUserId, setTargetUserId] = useState("");
  const [requestedRoleCode, setRequestedRoleCode] =
    useState<PlatformAdminUserRole>("superadmin");
  const [justification, setJustification] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Approval modal state
  const [selectedReq, setSelectedReq] =
    useState<PrivilegedRoleApprovalRequestRecord | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [acting, setActing] = useState(false);

  // Added SoD state
  const [sodError, setSodError] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await iamClient.listPrivilegedRoleRequests();
      setRequests(items ?? []);
    } catch (e: unknown) {
      setError(
        e instanceof Error
          ? e.message
          : "Failed to load privileged role requests",
      );
    } finally {
      setLoading(false);
    }
  }, [iamClient]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await iamClient.createPrivilegedRoleRequest({
        targetUserId: targetUserId.trim(),
        roleCode: requestedRoleCode,
        reason: justification.trim(),
        mutation: {
          reasonCode: "PRIVILEGED_ROLE_REQUEST",
          expectedVersion: 1,
        },
      });
      setShowCreateModal(false);
      setTargetUserId("");
      setJustification("");
      await loadRequests();
    } catch (err: unknown) {
      if (err instanceof ApiClientError && err.code === "IAM_SOD_VIOLATION") {
        setError(
          "職責分離衝突 · 核准已被系統阻擋: " +
            (err.apiMessage || "無例外理由放行。需先卸除不相容角色。"),
        );
      } else {
        setError(
          err instanceof Error ? err.message : "Failed to create role request",
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedReq) return;
    setActing(true);
    setError(null);
    setSodError(null);
    try {
      await iamClient.approvePrivilegedRoleRequest(selectedReq.requestId, {
        approvalRequestId: selectedReq.requestId,
        mutation: {
          reasonCode: actionReason.trim() || "PRIVILEGED_ROLE_APPROVED",
          expectedVersion: selectedReq.version ?? 1,
        },
      });
      setSelectedReq(null);
      setActionReason("");
      await loadRequests();
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        if (
          err.code === "IAM_STEP_UP_REQUIRED" ||
          err.code === "MFA_REQUIRED"
        ) {
          setError(
            "登入逾時 (IAM_STEP_UP_REQUIRED)，請重新登入 (Fresh MFA) 後再試。",
          );
        } else if (
          err.statusCode === 409 ||
          err.code === "IAM_CONCURRENCY_CONFLICT"
        ) {
          await loadRequests();
          setSelectedReq(null);
          setError("資料版本衝突，已自動重載。請重新選擇該申請。");
        } else if (err.code === "IAM_SOD_VIOLATION") {
          setSodError(
            err.apiMessage || "SoD Violation: Incompatible role pairs.",
          );
        } else {
          setError(err.message);
        }
      } else {
        setError(err instanceof Error ? err.message : "Role approval failed");
      }
    } finally {
      setActing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedReq) return;
    setActing(true);
    setError(null);
    try {
      await iamClient.rejectPrivilegedRoleRequest(selectedReq.requestId, {
        approvalRequestId: selectedReq.requestId,
        reason: actionReason.trim() || "PRIVILEGED_ROLE_REJECTED",
        mutation: {
          reasonCode: "PRIVILEGED_ROLE_REJECTED",
          expectedVersion: selectedReq.version ?? 1,
        },
      });
      setSelectedReq(null);
      setActionReason("");
      await loadRequests();
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        if (
          err.code === "IAM_STEP_UP_REQUIRED" ||
          err.code === "MFA_REQUIRED"
        ) {
          setError(
            "登入逾時 (IAM_STEP_UP_REQUIRED)，請重新登入 (Fresh MFA) 後再試。",
          );
        } else if (
          err.statusCode === 409 ||
          err.code === "IAM_CONCURRENCY_CONFLICT"
        ) {
          await loadRequests();
          setSelectedReq(null);
          setError("資料版本衝突，已自動重載。請重新選擇該申請。");
        } else {
          setError(err.message);
        }
      } else {
        setError(err instanceof Error ? err.message : "Role rejection failed");
      }
    } finally {
      setActing(false);
    }
  };

  const reqCols: CanvasTableColumn<
    PrivilegedRoleApprovalRequestRecord & Record<string, unknown>
  >[] = [
    { h: "REQUEST ID", k: "requestId", w: 140, mono: true },
    { h: "TARGET USER", k: "targetUserId", w: 180, mono: true },
    {
      h: "ROLE DIFF (BEFORE ➔ AFTER)",
      w: 220,
      r: (r) => (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
          }}
        >
          <CanvasPill theme={theme} tone="neutral">
            {r.previousRoleCode || "none"}
          </CanvasPill>
          <span style={{ color: theme.accent }}>➔</span>
          <CanvasPill theme={theme} tone="info">
            {r.requestedRoleCode}
          </CanvasPill>
        </div>
      ),
    },
    {
      h: "STATUS",
      w: 110,
      r: (r) => (
        <CanvasPill theme={theme} tone={statusTone(r.status)} dot>
          {r.status}
        </CanvasPill>
      ),
    },
    {
      h: "ACTIONS",
      w: 160,
      r: (r) => (
        <div style={{ display: "flex", gap: 4 }}>
          {r.status === "pending" ? (
            <CanvasBtn
              theme={theme}
              size="xs"
              variant="primary"
              onClick={() => {
                setSelectedReq(r);
                setSodError(null);
                setError(null);
                setActionReason("");
              }}
            >
              {t("users.governance.roleApproval.reviewStepUp")}
            </CanvasBtn>
          ) : (
            <CanvasBtn
              theme={theme}
              size="xs"
              variant="secondary"
              onClick={() => {
                setSelectedReq(r);
                setSodError(null);
                setError(null);
                setActionReason("");
              }}
            >
              {t("users.governance.roleApproval.viewDetail")}
            </CanvasBtn>
          )}
        </div>
      ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {error ? (
        <CanvasBanner theme={theme} tone="danger" icon="warn" title={error} />
      ) : null}

      <CanvasCard
        theme={theme}
        title={t("users.governance.roleApproval.title")}
        subtitle="Two-person approval and Separation of Duties enforcement for elevated workforce roles"
        actions={
          <>
            <CanvasBtn
              theme={theme}
              icon="arrow"
              variant="secondary"
              onClick={() => void loadRequests()}
            >
              Refresh
            </CanvasBtn>
            <CanvasBtn
              theme={theme}
              icon="plus"
              variant="primary"
              onClick={() => setShowCreateModal(true)}
            >
              {t("users.governance.roleApproval.requestButton")}
            </CanvasBtn>
          </>
        }
      >
        {loading ? (
          <div
            style={{ padding: 24, textAlign: "center", color: theme.textMuted }}
          >
            {t("users.governance.roleApproval.loading")}
          </div>
        ) : requests.length === 0 ? (
          <div
            style={{ padding: 24, textAlign: "center", color: theme.textMuted }}
          >
            {t("users.governance.roleApproval.empty")}
          </div>
        ) : (
          <CanvasTable
            theme={theme}
            columns={reqCols}
            rows={requests.map((r) => ({ ...r }))}
          />
        )}
      </CanvasCard>

      {/* Create Request Modal */}
      {showCreateModal ? (
        <div style={overlayStyle} role="dialog" aria-modal="true">
          <div style={modalStyle}>
            <div style={headerStyle}>
              <h2 style={titleStyle}>
                {t("users.governance.roleApproval.modalTitle")}
              </h2>
              <CanvasBtn
                theme={theme}
                variant="ghost"
                onClick={() => setShowCreateModal(false)}
              >
                ✕
              </CanvasBtn>
            </div>
            <form onSubmit={handleCreate}>
              <div style={bodyStyle}>
                <CanvasField theme={theme} label="Target User ID" required>
                  <input
                    type="text"
                    required
                    value={targetUserId}
                    onChange={(e) => setTargetUserId(e.target.value)}
                    placeholder="e.g. user_pa_super_01"
                    style={controlStyle}
                  />
                </CanvasField>

                <CanvasField theme={theme} label="Requested Role" required>
                  <select
                    value={requestedRoleCode}
                    onChange={(e) =>
                      setRequestedRoleCode(
                        e.target.value as PlatformAdminUserRole,
                      )
                    }
                    style={controlStyle}
                  >
                    <option value="superadmin">
                      {t("users.governance.roleApproval.roleSuperadmin")}
                    </option>
                    <option value="admin">
                      {t("users.governance.roleApproval.roleAdmin")}
                    </option>
                    <option value="operator">
                      {t("users.governance.roleApproval.roleOperator")}
                    </option>
                  </select>
                </CanvasField>

                <CanvasField
                  theme={theme}
                  label="Justification & Business Reason"
                  required
                >
                  <textarea
                    required
                    rows={3}
                    value={justification}
                    onChange={(e) => setJustification(e.target.value)}
                    placeholder={t(
                      "users.governance.roleApproval.justificationPlaceholder",
                    )}
                    style={{ ...controlStyle, resize: "vertical" }}
                  />
                </CanvasField>
              </div>

              <div style={footerStyle}>
                <CanvasBtn
                  theme={theme}
                  variant="secondary"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </CanvasBtn>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    background: theme.accent,
                    color: "#fff",
                    border: `1px solid ${theme.accent}`,
                    borderRadius: 7,
                    padding: "8px 14px",
                    fontWeight: 600,
                    cursor: submitting ? "not-allowed" : "pointer",
                  }}
                >
                  {submitting ? "Submitting…" : "Submit Request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Review Modal */}
      {selectedReq ? (
        <div style={overlayStyle} role="dialog" aria-modal="true">
          <div style={modalStyle}>
            <div style={headerStyle}>
              <h2 style={titleStyle}>
                {t("users.governance.roleApproval.reviewModalTitle")}{" "}
                {selectedReq.requestId}
              </h2>
              <CanvasBtn
                theme={theme}
                variant="ghost"
                onClick={() => setSelectedReq(null)}
              >
                ✕
              </CanvasBtn>
            </div>
            <div style={bodyStyle}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                  fontSize: 12.5,
                }}
              >
                <div>
                  <span style={{ color: theme.textMuted }}>Target:</span>{" "}
                  {selectedReq.targetUserId}
                </div>
                <div>
                  <span style={{ color: theme.textMuted }}>Requester:</span>{" "}
                  {selectedReq.requesterPrincipalId}
                </div>
                <div>
                  <span style={{ color: theme.textMuted }}>Elevation:</span>{" "}
                  {selectedReq.previousRoleCode || "none"} ➔{" "}
                  {selectedReq.requestedRoleCode}
                </div>
                <div>
                  <span style={{ color: theme.textMuted }}>Status:</span>{" "}
                  <CanvasPill
                    theme={theme}
                    tone={statusTone(selectedReq.status)}
                    dot
                  >
                    {selectedReq.status}
                  </CanvasPill>
                </div>
              </div>

              {sodError ? (
                <CanvasBanner
                  theme={theme}
                  tone="danger"
                  icon="lock"
                  title={stepUpCopy.sodViolationTitle}
                  body={
                    sodError +
                    " 後端 checkSodPolicy 回 403 IAM_SOD_VIOLATION；無例外理由放行。需先卸除衝突角色或改申請其他角色。"
                  }
                />
              ) : null}

              <CanvasField
                theme={theme}
                label="Approval / Rejection Reason"
                required
              >
                <textarea
                  rows={3}
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  placeholder={t(
                    "users.governance.roleApproval.reasonPlaceholder",
                  )}
                  style={{ ...controlStyle, resize: "vertical" }}
                />
              </CanvasField>
            </div>

            <div style={footerStyle}>
              <CanvasBtn
                theme={theme}
                variant="secondary"
                onClick={() => setSelectedReq(null)}
              >
                Close
              </CanvasBtn>
              {selectedReq.status === "pending" ? (
                <>
                  <CanvasBtn
                    theme={theme}
                    variant="secondary"
                    danger
                    disabled={acting}
                    onClick={() => void handleReject()}
                  >
                    {acting ? "Rejecting…" : "Reject Request"}
                  </CanvasBtn>
                  <CanvasBtn
                    theme={theme}
                    variant="primary"
                    disabled={acting || !!sodError}
                    onClick={() => void handleApprove()}
                  >
                    {acting ? "Approving…" : "Approve & Grant Role"}
                  </CanvasBtn>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── 3. Access Reviews Surface Panel ───────────────────────────────────────────

export function AccessReviewPanel() {
  const rawClient = usePlatformAdminClient();
  const iamClient = useMemo(
    () => createPlatformAdminIamClient(rawClient),
    [rawClient],
  );
  const { t } = useTranslation();

  const [campaigns, setCampaigns] = useState<AccessReviewCampaignRecord[]>([]);
  const [evidence, setEvidence] = useState<AccessReviewEvidenceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Campaign create form
  const [title, setTitle] = useState("");
  const [realm, setRealm] = useState<
    "platform" | "tenant" | "partner" | "operations"
  >("platform");
  const [reviewerPrincipalId, setReviewerPrincipalId] = useState("");
  const [deadlineAt, setDeadlineAt] = useState("");
  const [creating, setCreating] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cList, eList] = await Promise.all([
        iamClient.listAccessReviews({ realm: "platform" }),
        iamClient.queryAccessReviewEvidence({ limit: 20 }),
      ]);
      setCampaigns(cList ?? []);
      setEvidence(eList ?? []);
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : "Failed to load access reviews",
      );
    } finally {
      setLoading(false);
    }
  }, [iamClient]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleCreateCampaign = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await iamClient.createAccessReviewCampaign({
        title: title.trim(),
        realm,
        reviewerPrincipalId: reviewerPrincipalId.trim(),
        deadlineAt: deadlineAt
          ? new Date(deadlineAt).toISOString()
          : new Date(Date.now() + 86400000 * 7).toISOString(),
        overduePolicy: "auto_revoke",
      });
      setShowCreateModal(false);
      setTitle("");
      setReviewerPrincipalId("");
      await loadData();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to create access review campaign",
      );
    } finally {
      setCreating(false);
    }
  };

  const handleSweep = async () => {
    setLoading(true);
    try {
      await iamClient.triggerOverdueSweep();
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Overdue sweep failed");
    } finally {
      setLoading(false);
    }
  };

  const campaignCols: CanvasTableColumn<
    AccessReviewCampaignRecord & Record<string, unknown>
  >[] = [
    { h: "CAMPAIGN ID", k: "campaignId", w: 140, mono: true },
    { h: "TITLE", k: "title", w: 200 },
    { h: "REALM", k: "realm", w: 100, mono: true },
    { h: "REVIEWER", k: "reviewerPrincipalId", w: 160, mono: true },
    {
      h: "STATUS",
      w: 100,
      r: (r) => (
        <CanvasPill theme={theme} tone={statusTone(r.status)} dot>
          {r.status}
        </CanvasPill>
      ),
    },
    {
      h: "DEADLINE",
      w: 150,
      mono: true,
      r: (r) => formatDateTime(r.deadlineAt),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {error ? (
        <CanvasBanner theme={theme} tone="danger" icon="warn" title={error} />
      ) : null}

      <CanvasCard
        theme={theme}
        title={t("users.governance.accessReview.campaignsTitle")}
        subtitle="Certify, reduce, or remove privileged role bindings before overdue policy auto-revokes access"
        actions={
          <>
            <CanvasBtn
              theme={theme}
              variant="secondary"
              icon="arrow"
              onClick={() => void handleSweep()}
            >
              {t("users.governance.accessReview.sweepOverdue")}
            </CanvasBtn>
            <CanvasBtn
              theme={theme}
              variant="primary"
              icon="plus"
              onClick={() => setShowCreateModal(true)}
            >
              {t("users.governance.accessReview.newCampaign")}
            </CanvasBtn>
          </>
        }
      >
        {loading ? (
          <div
            style={{ padding: 24, textAlign: "center", color: theme.textMuted }}
          >
            {t("users.governance.accessReview.loadingCampaigns")}
          </div>
        ) : campaigns.length === 0 ? (
          <div
            style={{ padding: 24, textAlign: "center", color: theme.textMuted }}
          >
            {t("users.governance.accessReview.campaignsEmpty")}
          </div>
        ) : (
          <CanvasTable
            theme={theme}
            columns={campaignCols}
            rows={campaigns.map((c) => ({ ...c }))}
          />
        )}
      </CanvasCard>

      <CanvasCard
        theme={theme}
        title={t("users.governance.accessReview.evidenceTitle")}
        subtitle="Audit trail for certified, reduced, or remediated access decisions"
      >
        {evidence.length === 0 ? (
          <div
            style={{ padding: 16, textAlign: "center", color: theme.textMuted }}
          >
            {t("users.governance.accessReview.evidenceEmpty")}
          </div>
        ) : (
          <CanvasTable
            theme={theme}
            columns={[
              { h: "EVIDENCE ID", k: "evidenceId", w: 140, mono: true },
              { h: "ACTOR", k: "actorPrincipalId", w: 150, mono: true },
              { h: "TARGET", k: "targetPrincipalId", w: 150, mono: true },
              {
                h: "DECISION",
                w: 110,
                r: (r) => (
                  <CanvasPill theme={theme} tone={statusTone(r.decision)}>
                    {r.decision}
                  </CanvasPill>
                ),
              },
              { h: "REASON CODE", k: "reasonCode", w: 140, mono: true },
              {
                h: "LOGGED AT",
                w: 150,
                mono: true,
                r: (r) => formatDateTime(r.createdAt),
              },
            ]}
            rows={evidence.map((e) => ({ ...e }))}
          />
        )}
      </CanvasCard>

      {/* Create Modal */}
      {showCreateModal ? (
        <div style={overlayStyle} role="dialog" aria-modal="true">
          <div style={modalStyle}>
            <div style={headerStyle}>
              <h2 style={titleStyle}>
                {t("users.governance.accessReview.createCampaignModalTitle")}
              </h2>
              <CanvasBtn
                theme={theme}
                variant="ghost"
                onClick={() => setShowCreateModal(false)}
              >
                ✕
              </CanvasBtn>
            </div>
            <form onSubmit={handleCreateCampaign}>
              <div style={bodyStyle}>
                <CanvasField theme={theme} label="Campaign Title" required>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={t(
                      "users.governance.accessReview.titlePlaceholder",
                    )}
                    style={controlStyle}
                  />
                </CanvasField>

                <CanvasField theme={theme} label="Realm">
                  <select
                    value={realm}
                    onChange={(e) => setRealm(e.target.value as any)}
                    style={controlStyle}
                  >
                    <option value="platform">platform</option>
                    <option value="tenant">tenant</option>
                    <option value="partner">partner</option>
                    <option value="operations">operations</option>
                  </select>
                </CanvasField>

                <CanvasField
                  theme={theme}
                  label="Reviewer Principal ID"
                  required
                >
                  <input
                    type="text"
                    required
                    value={reviewerPrincipalId}
                    onChange={(e) => setReviewerPrincipalId(e.target.value)}
                    placeholder="e.g. user_pa_compliance_lead"
                    style={controlStyle}
                  />
                </CanvasField>

                <CanvasField theme={theme} label="Deadline Date">
                  <input
                    type="datetime-local"
                    value={deadlineAt}
                    onChange={(e) => setDeadlineAt(e.target.value)}
                    style={controlStyle}
                  />
                </CanvasField>
              </div>

              <div style={footerStyle}>
                <CanvasBtn
                  theme={theme}
                  variant="secondary"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </CanvasBtn>
                <button
                  type="submit"
                  disabled={creating}
                  style={{
                    background: theme.accent,
                    color: "#fff",
                    border: `1px solid ${theme.accent}`,
                    borderRadius: 7,
                    padding: "8px 14px",
                    fontWeight: 600,
                    cursor: creating ? "not-allowed" : "pointer",
                  }}
                >
                  {creating ? "Creating…" : "Create Campaign"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── 4. Break-Glass Emergency Access Panel ─────────────────────────────────────

export function BreakGlassPanel() {
  const rawClient = usePlatformAdminClient();
  const iamClient = useMemo(
    () => createPlatformAdminIamClient(rawClient),
    [rawClient],
  );
  const { t: originalT, locale } = useTranslation();
  const bgCopy = useMemo(() => getBreakGlassCopy(locale), [locale]);
  const stepUpCopy = useMemo(() => getStepUpCopy(locale), [locale]);
  const t = useCallback(
    (key: string) => {
      if (key.startsWith("users.governance.breakGlass.")) {
        const k = key.replace("users.governance.breakGlass.", "");
        return bgCopy[k as keyof typeof bgCopy] || originalT(key);
      }
      return originalT(key);
    },
    [originalT, bgCopy],
  );

  const {
    activateSession,
    isBreakGlassActive,
    grant: activeGrant,
  } = useBreakGlass();

  const [grants, setGrants] = useState<BreakGlassGrantRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showRequestModal, setShowRequestModal] = useState(false);

  // Form state
  const [requestedScopes, setRequestedScopes] = useState(
    "identity:read, security:audit:read",
  );
  const [reasonCode, setReasonCode] = useState("INCIDENT_BREAK_GLASS");
  const [reasonText, setReasonText] = useState("");
  const [proofReference, setProofReference] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Added Step-up state
  const [stepUpState, setStepUpState] = useState<
    "NONE" | "VERIFYING" | "VALID" | "EXPIRED"
  >("NONE");
  const [stepUpRef, setStepUpRef] = useState<string | null>(null);

  const stepUpTimerRef = useRef<NodeJS.Timeout | null>(null);
  const stepUpNonceRef = useRef<number>(0);

  const clearStepUp = useCallback(() => {
    if (stepUpTimerRef.current) {
      clearTimeout(stepUpTimerRef.current);
      stepUpTimerRef.current = null;
    }
    stepUpNonceRef.current += 1;
    setStepUpRef(null);
    setStepUpState("NONE");
  }, []);

  useEffect(() => {
    return () => clearStepUp();
  }, [clearStepUp]);

  const fetchGrants = useCallback(async () => {
    try {
      const res = await iamClient.listBreakGlassRequests();
      setGrants(res.items || []);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError("Failed to fetch requests: " + err.message);
      }
    }
  }, [iamClient]);

  useEffect(() => {
    void fetchGrants();
  }, [fetchGrants]);

  const handleGetStepUpProof = async (actionId: string) => {
    clearStepUp();
    const nonce = stepUpNonceRef.current;
    setStepUpState("VERIFYING");
    try {
      const proof = await iamClient.createStepUpProof({
        actionId: actionId as any,
      });
      if (stepUpNonceRef.current !== nonce) return;
      if (proof.required === false || !proof.stepUpReference) {
        setStepUpRef(null);
        setStepUpState("VALID");
      } else if (proof.stepUpReference) {
        setStepUpRef(proof.stepUpReference);
        setStepUpState("VALID");
        if (proof.expiresAt) {
          const ttl = new Date(proof.expiresAt).getTime() - Date.now();
          if (ttl > 0) {
            stepUpTimerRef.current = setTimeout(() => {
              if (stepUpNonceRef.current !== nonce) return;
              setStepUpState((prev) => (prev === "VALID" ? "EXPIRED" : prev));
              setStepUpRef((prev) =>
                prev === proof.stepUpReference ? null : prev,
              );
            }, ttl);
          } else {
            setStepUpState("EXPIRED");
            setStepUpRef(null);
          }
        }
      }
    } catch (e: unknown) {
      if (stepUpNonceRef.current !== nonce) return;
      setStepUpState("NONE");
      setError(e instanceof Error ? e.message : "Failed to get step-up proof");
    }
  };

  // Selected grant modal for approve/activate
  const [selectedGrant, setSelectedGrant] =
    useState<BreakGlassGrantRecord | null>(null);
  const [acting, setActing] = useState(false);

  const handleRequest = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const created = await iamClient.requestBreakGlass({
        requestedScopes: requestedScopes
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        reasonCode: reasonCode.trim(),
        reasonText: reasonText.trim(),
        proofReference: proofReference.trim(),
        mutation: {
          reasonCode: "BREAK_GLASS_REQUEST",
          expectedVersion: 1,
          stepUpReference: stepUpRef,
        },
      });
      setGrants((prev) => [created, ...prev]);
      setShowRequestModal(false);
      setReasonText("");
      clearStepUp();
    } catch (err: unknown) {
      if (
        err instanceof ApiClientError &&
        (err.code === "IAM_STEP_UP_REQUIRED" ||
          err.code === "MFA_REQUIRED" ||
          err.code === "STEP_UP_REQUIRED")
      ) {
        setStepUpState("EXPIRED");
        setStepUpRef(null);
        setError(
          "憑證已過期或被拒絕 (IAM_STEP_UP_REQUIRED)，請重新取得或重新登入 (Fresh MFA)。",
        );
      } else {
        setError(
          err instanceof Error ? err.message : "Break-glass request failed",
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleReloadGrant = useCallback(
    async (grantId: string) => {
      try {
        const currentGrant = await iamClient.getBreakGlassRequest(grantId);
        setGrants((prev) =>
          prev.map((item) => (item.grantId === grantId ? currentGrant : item)),
        );
        setSelectedGrant((prev) => (prev?.grantId === grantId ? currentGrant : prev));
      } catch (err: unknown) {
        setGrants((prev) =>
          prev.map((item) =>
            item.grantId === grantId
              ? ({ ...item, _syncError: true } as any)
              : item,
          ),
        );
        setSelectedGrant((prev) => (prev?.grantId === grantId ? null : prev));
      }
    },
    [iamClient],
  );

  const handleApproveGrant = async (g: BreakGlassGrantRecord) => {
    setActing(true);
    setError(null);
    try {
      const approved = await iamClient.approveBreakGlass(g.grantId, {
        mutation: {
          reasonCode: "BREAK_GLASS_APPROVED",
          expectedVersion: g.version ?? 1,
          stepUpReference: stepUpRef,
        },
      });
      setGrants((prev) =>
        prev.map((item) =>
          item.grantId === approved.grantId ? approved : item,
        ),
      );
      setSelectedGrant(approved);
      clearStepUp();
    } catch (err: unknown) {
      if (
        err instanceof ApiClientError &&
        err.code === "IAM_CONCURRENCY_CONFLICT"
      ) {
        clearStepUp();
        setError("狀態已變更，請重新整理 (IAM_CONCURRENCY_CONFLICT)。");
        void handleReloadGrant(g.grantId);
      } else if (
        err instanceof ApiClientError &&
        (err.code === "IAM_STEP_UP_REQUIRED" ||
          err.code === "MFA_REQUIRED" ||
          err.code === "STEP_UP_REQUIRED")
      ) {
        setStepUpState("EXPIRED");
        setStepUpRef(null);
        setError(
          "憑證已過期或被拒絕 (IAM_STEP_UP_REQUIRED)，請重新取得或重新登入 (Fresh MFA)。",
        );
      } else {
        setError(
          err instanceof Error ? err.message : "Break-glass approval failed",
        );
      }
    } finally {
      setActing(false);
    }
  };

  const handleActivateGrant = async (g: BreakGlassGrantRecord) => {
    setActing(true);
    setError(null);
    try {
      const result = await iamClient.activateBreakGlass(g.grantId, {
        requestId: g.grantId,
        requestedScope: g.requestedScopes,
        requestedDurationMinutes: 30,
        mutation: {
          reasonCode: "BREAK_GLASS_ACTIVATED",
          expectedVersion: g.version ?? 1,
          stepUpReference: stepUpRef,
        },
      });
      activateSession(result.grant, result.accessToken, result.expiresAt);
      setSelectedGrant(null);
      clearStepUp();
    } catch (err: unknown) {
      if (
        err instanceof ApiClientError &&
        err.code === "IAM_CONCURRENCY_CONFLICT"
      ) {
        clearStepUp();
        setError("狀態已變更，請重新整理 (IAM_CONCURRENCY_CONFLICT)。");
        void handleReloadGrant(g.grantId);
      } else if (
        err instanceof ApiClientError &&
        (err.code === "IAM_STEP_UP_REQUIRED" ||
          err.code === "MFA_REQUIRED" ||
          err.code === "STEP_UP_REQUIRED")
      ) {
        setStepUpState("EXPIRED");
        setStepUpRef(null);
        setError(
          "憑證已過期或被拒絕 (IAM_STEP_UP_REQUIRED)，請重新取得或重新登入 (Fresh MFA)。",
        );
      } else {
        setError(
          err instanceof Error ? err.message : "Break-glass activation failed",
        );
      }
    } finally {
      setActing(false);
    }
  };

  const grantCols: CanvasTableColumn<
    BreakGlassGrantRecord & Record<string, unknown>
  >[] = [
    { h: "GRANT ID", k: "grantId", w: 140, mono: true },
    { h: "REQUESTER", k: "requesterId", w: 150, mono: true },
    { h: "REASON CODE", k: "reasonCode", w: 160, mono: true },
    {
      h: "STATUS",
      w: 110,
      r: (r) => (
        <CanvasPill theme={theme} tone={statusTone(r.status)} dot>
          {r.status}
        </CanvasPill>
      ),
    },
    {
      h: "REQUESTED AT",
      w: 150,
      mono: true,
      r: (r) => formatDateTime(r.requestedAt),
    },
    {
      h: "EXPIRES AT",
      w: 160,
      mono: true,
      r: (r) => {
        if (r.status === "approved" && !r.activatedAt) {
          return (
            <span style={{ color: theme.textMuted }}>{bgCopy.nonExpiring}</span>
          );
        }
        if (r.status === "active" && r.expiresAt) {
          return formatDateTime(r.expiresAt);
        }
        return <span style={{ color: theme.textMuted }}>—</span>;
      },
    },
    {
      h: "ACTIONS",
      w: 160,
      r: (r) => (
        <CanvasBtn
          theme={theme}
          size="xs"
          variant={r._syncError ? "ghost" : "primary"}
          onClick={() => {
            if (r._syncError) {
              void handleReloadGrant(r.grantId);
              return;
            }
            clearStepUp();
            setSelectedGrant(r);
          }}
        >
          {r._syncError ? "Retry Sync" : t("users.governance.breakGlass.manageGrant")}
        </CanvasBtn>
      ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {error ? (
        <CanvasBanner theme={theme} tone="danger" icon="warn" title={error} />
      ) : null}

      {isBreakGlassActive && activeGrant ? (
        <CanvasBanner
          theme={theme}
          tone="danger"
          icon="warn"
          title={t("users.governance.breakGlass.activeSessionTitle")}
          body={`Grant ID ${activeGrant.grantId} is currently active. The persistent top banner displays countdown TTL and exit controls.`}
        />
      ) : null}

      <CanvasCard
        theme={theme}
        title={t("users.governance.breakGlass.surfaceTitle")}
        subtitle="Two-person approval emergency privilege elevation with mandatory countdown and persistent banner"
        actions={
          <CanvasBtn
            theme={theme}
            icon="plus"
            variant="primary"
            danger
            onClick={() => setShowRequestModal(true)}
          >
            {t("users.governance.breakGlass.requestButton")}
          </CanvasBtn>
        }
      >
        {grants.length === 0 ? (
          <div
            style={{ padding: 24, textAlign: "center", color: theme.textMuted }}
          >
            {t("users.governance.breakGlass.empty")}
          </div>
        ) : (
          <CanvasTable
            theme={theme}
            columns={grantCols}
            rows={grants.map((g) => ({ ...g }))}
          />
        )}
      </CanvasCard>

      {/* Request Modal */}
      {showRequestModal ? (
        <div style={overlayStyle} role="dialog" aria-modal="true">
          <div style={modalStyle}>
            <div style={headerStyle}>
              <h2 style={titleStyle}>
                {t("users.governance.breakGlass.requestModalTitle")}
              </h2>
              <CanvasBtn
                theme={theme}
                variant="ghost"
                onClick={() => {
                  clearStepUp();
                  setShowRequestModal(false);
                }}
              >
                ✕
              </CanvasBtn>
            </div>
            <form onSubmit={handleRequest}>
              <div style={bodyStyle}>
                <CanvasBanner
                  theme={theme}
                  tone="warn"
                  icon="warn"
                  title={t(
                    "users.governance.breakGlass.escalationWarningTitle",
                  )}
                  body="Break-glass grants immediate superadmin privileges for emergency recovery. Two-person approval and mandatory post-incident audit apply."
                />

                <CanvasField theme={theme} label="Requested Scopes" required>
                  <input
                    type="text"
                    required
                    value={requestedScopes}
                    onChange={(e) => setRequestedScopes(e.target.value)}
                    style={controlStyle}
                  />
                </CanvasField>

                <CanvasField theme={theme} label="Reason Code" required>
                  <input
                    type="text"
                    required
                    value={reasonCode}
                    onChange={(e) => setReasonCode(e.target.value)}
                    style={controlStyle}
                  />
                </CanvasField>

                <CanvasField
                  theme={theme}
                  label="Incident / Outage Justification"
                  required
                >
                  <textarea
                    required
                    rows={3}
                    value={reasonText}
                    onChange={(e) => setReasonText(e.target.value)}
                    placeholder={t(
                      "users.governance.breakGlass.justificationPlaceholder",
                    )}
                    style={{ ...controlStyle, resize: "vertical" }}
                  />
                </CanvasField>

                <CanvasField
                  theme={theme}
                  label={t("users.governance.breakGlass.proofReferenceLabel")}
                >
                  <input
                    type="text"
                    value={proofReference}
                    onChange={(e) => setProofReference(e.target.value)}
                    placeholder={t(
                      "users.governance.breakGlass.proofReferencePlaceholder",
                    )}
                    style={controlStyle}
                  />
                </CanvasField>

                {stepUpState === "NONE" ? (
                  <CanvasBanner
                    theme={theme}
                    tone="warn"
                    icon="lock"
                    title={stepUpCopy.stepUpRequiredTitle}
                    body="申請前請先取得 step-up 憑證或重新登入 (Fresh MFA)。"
                    actions={
                      <CanvasBtn
                        theme={theme}
                        size="xs"
                        variant="primary"
                        icon="lock"
                        onClick={() => {
                          handleGetStepUpProof("platform:break-glass:request");
                        }}
                      >
                        {stepUpCopy.getStepUpProof}
                      </CanvasBtn>
                    }
                  />
                ) : stepUpState === "VERIFYING" ? (
                  <CanvasBanner
                    theme={theme}
                    tone="info"
                    icon="clock"
                    title={stepUpCopy.verifyingTitle}
                    body="正在向伺服器請求身分驗證憑證..."
                  />
                ) : stepUpState === "EXPIRED" ? (
                  <CanvasBanner
                    theme={theme}
                    tone="danger"
                    icon="warn"
                    title={stepUpCopy.expiredTitle}
                    body="憑證已過期或已被使用，請重新取得。"
                    actions={
                      <CanvasBtn
                        theme={theme}
                        size="xs"
                        variant="primary"
                        icon="refresh"
                        onClick={() => {
                          handleGetStepUpProof("platform:break-glass:request");
                        }}
                      >
                        {stepUpCopy.retry}
                      </CanvasBtn>
                    }
                  />
                ) : null}

                {stepUpState === "VALID" ||
                stepUpState === "VERIFYING" ||
                stepUpState === "EXPIRED" ? (
                  <CanvasField
                    theme={theme}
                    label="stepUpReference"
                    required
                    hint={
                      stepUpState === "VERIFYING"
                        ? "驗證中..."
                        : stepUpState === "EXPIRED"
                          ? "已失效"
                          : "有效"
                    }
                  >
                    <input
                      type="text"
                      value={stepUpRef || "—"}
                      readOnly
                      disabled
                      style={controlStyle}
                    />
                  </CanvasField>
                ) : null}
              </div>

              <div style={footerStyle}>
                <CanvasBtn
                  theme={theme}
                  variant="secondary"
                  onClick={() => {
                    clearStepUp();
                    setShowRequestModal(false);
                  }}
                >
                  Cancel
                </CanvasBtn>
                <button
                  type="submit"
                  disabled={submitting || stepUpState !== "VALID"}
                  style={{
                    background: theme.danger,
                    color: "#fff",
                    border: `1px solid ${theme.danger}`,
                    borderRadius: 7,
                    padding: "8px 14px",
                    fontWeight: 600,
                    cursor: submitting ? "not-allowed" : "pointer",
                  }}
                >
                  {submitting ? "Submitting…" : "Request Emergency Access"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Grant Detail / Action Modal */}
      {selectedGrant ? (
        <div style={overlayStyle} role="dialog" aria-modal="true">
          <div style={modalStyle}>
            <div style={headerStyle}>
              <h2 style={titleStyle}>
                {t("users.governance.breakGlass.grantModalTitle")}{" "}
                {selectedGrant.grantId}
              </h2>
              <CanvasBtn
                theme={theme}
                variant="ghost"
                onClick={() => {
                  clearStepUp();
                  setSelectedGrant(null);
                }}
              >
                ✕
              </CanvasBtn>
            </div>

            <div style={bodyStyle}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                  fontSize: 12.5,
                }}
              >
                <div>
                  <span style={{ color: theme.textMuted }}>Requester:</span>{" "}
                  {selectedGrant.requesterId}
                </div>
                <div>
                  <span style={{ color: theme.textMuted }}>
                    {t("users.governance.breakGlass.reasonCodeLabel")}
                  </span>{" "}
                  {selectedGrant.reasonCode}
                </div>
                <div>
                  <span style={{ color: theme.textMuted }}>Status:</span>{" "}
                  <CanvasPill
                    theme={theme}
                    tone={statusTone(selectedGrant.status)}
                    dot
                  >
                    {selectedGrant.status}
                  </CanvasPill>
                </div>
                <div>
                  <span style={{ color: theme.textMuted }}>
                    {t("users.governance.breakGlass.postUseAuditLabel")}
                  </span>{" "}
                  Required
                </div>
                <div>
                  <span style={{ color: theme.textMuted }}>
                    {bgCopy.expiresAt}:
                  </span>{" "}
                  {selectedGrant.status === "approved" &&
                  !selectedGrant.activatedAt
                    ? bgCopy.nonExpiring
                    : selectedGrant.status === "active" &&
                        selectedGrant.expiresAt
                      ? formatDateTime(selectedGrant.expiresAt)
                      : "—"}
                </div>
              </div>

              <div
                style={{
                  background: theme.surfaceLo,
                  padding: 12,
                  borderRadius: 8,
                  fontSize: 12,
                }}
              >
                <strong>Justification:</strong> {selectedGrant.reasonText}
              </div>
            </div>

            <div style={{ padding: "0 24px" }}>
              {stepUpState === "NONE" ? (
                <CanvasBanner
                  theme={theme}
                  tone="warn"
                  icon="lock"
                  title={stepUpCopy.stepUpRequiredTitle}
                  body="操作前請先取得 step-up 憑證或重新登入 (Fresh MFA)。"
                  actions={
                    selectedGrant?.status === "requested" ? (
                      <CanvasBtn
                        theme={theme}
                        size="xs"
                        variant="primary"
                        icon="lock"
                        onClick={() => {
                          handleGetStepUpProof("platform:break-glass:approve");
                        }}
                      >
                        {stepUpCopy.getStepUpProof}
                      </CanvasBtn>
                    ) : selectedGrant?.status === "approved" ? (
                      <CanvasBtn
                        theme={theme}
                        size="xs"
                        variant="primary"
                        icon="lock"
                        onClick={() => {
                          handleGetStepUpProof("platform:break-glass:activate");
                        }}
                      >
                        {stepUpCopy.getStepUpProof}
                      </CanvasBtn>
                    ) : null
                  }
                />
              ) : stepUpState === "VERIFYING" ? (
                <CanvasBanner
                  theme={theme}
                  tone="info"
                  icon="clock"
                  title={stepUpCopy.verifyingTitle}
                  body="正在向伺服器請求身分驗證憑證..."
                />
              ) : stepUpState === "EXPIRED" ? (
                <CanvasBanner
                  theme={theme}
                  tone="danger"
                  icon="warn"
                  title={stepUpCopy.expiredTitle}
                  body="憑證已過期或已被使用，請重新取得。"
                  actions={
                    selectedGrant?.status === "requested" ? (
                      <CanvasBtn
                        theme={theme}
                        size="xs"
                        variant="primary"
                        icon="refresh"
                        onClick={() => {
                          handleGetStepUpProof("platform:break-glass:approve");
                        }}
                      >
                        {stepUpCopy.retry}
                      </CanvasBtn>
                    ) : selectedGrant?.status === "approved" ? (
                      <CanvasBtn
                        theme={theme}
                        size="xs"
                        variant="primary"
                        icon="refresh"
                        onClick={() => {
                          handleGetStepUpProof("platform:break-glass:activate");
                        }}
                      >
                        {stepUpCopy.retry}
                      </CanvasBtn>
                    ) : null
                  }
                />
              ) : null}

              {stepUpState === "VALID" ||
              stepUpState === "VERIFYING" ||
              stepUpState === "EXPIRED" ? (
                <CanvasField
                  theme={theme}
                  label="stepUpReference"
                  required
                  hint={
                    stepUpState === "VERIFYING"
                      ? "驗證中..."
                      : stepUpState === "EXPIRED"
                        ? "已失效"
                        : "有效"
                  }
                >
                  <input
                    type="text"
                    value={stepUpRef || "—"}
                    readOnly
                    disabled
                    style={controlStyle}
                  />
                </CanvasField>
              ) : null}
            </div>

            <div style={footerStyle}>
              <CanvasBtn
                theme={theme}
                variant="secondary"
                onClick={() => {
                  clearStepUp();
                  setSelectedGrant(null);
                }}
              >
                Close
              </CanvasBtn>
              {selectedGrant.status === "requested" ? (
                <CanvasBtn
                  theme={theme}
                  variant="primary"
                  disabled={acting || stepUpState !== "VALID"}
                  onClick={() => void handleApproveGrant(selectedGrant)}
                >
                  {acting ? "Approving…" : "Approve (2nd Person Sign-Off)"}
                </CanvasBtn>
              ) : selectedGrant.status === "approved" ? (
                <CanvasBtn
                  theme={theme}
                  variant="primary"
                  danger
                  disabled={acting || stepUpState !== "VALID"}
                  onClick={() => void handleActivateGrant(selectedGrant)}
                >
                  {acting ? "Activating…" : "Activate Emergency Session"}
                </CanvasBtn>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
