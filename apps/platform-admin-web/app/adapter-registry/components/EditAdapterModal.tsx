import React, { useEffect, useMemo, useState } from "react";
import {
  PlatformAdapter,
  RolloutStatus,
  type UpdatePlatformAdapterCommand,
} from "@drts/contracts";
import {
  actionButtonStyle,
  fieldLabelStyle,
  inputStyle,
  monoTextStyle,
  switchStyle,
  textMutedStyle,
} from "@/components/platform-ui";
import { useTranslation } from "@/lib/i18n";
import {
  formatPlatformCodeLabel,
  getPlatformLabel,
} from "@/lib/localized-labels";
import {
  CalloutBanner,
  DataCellStack,
  DetailMetadataGrid,
  StatusChip,
  WorkflowDetailDrawer,
} from "@drts/ui-web";

interface EditAdapterModalProps {
  adapter: PlatformAdapter | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    updatedAdapter: UpdatePlatformAdapterCommand,
  ) => Promise<void> | void;
}

function toneForRollout(status: PlatformAdapter["rolloutStatus"]) {
  switch (status) {
    case "COMPLETED":
      return "success" as const;
    case "IN_PROGRESS":
      return "info" as const;
    case "FAILED":
      return "danger" as const;
    case "NOT_STARTED":
    default:
      return "neutral" as const;
  }
}

function toneForCredential(status: PlatformAdapter["credentialStatus"]) {
  switch (status) {
    case "VALID":
      return "success" as const;
    case "PENDING":
      return "info" as const;
    case "INVALID":
    case "EXPIRED":
      return "danger" as const;
    case "NOT_CONFIGURED":
    default:
      return "warning" as const;
  }
}

function toneForWebhook(enabled: boolean | undefined) {
  return enabled ? ("success" as const) : ("warning" as const);
}

function toneForAuthority(
  mode: PlatformAdapter["policies"]["financeAuthorityMode"],
) {
  switch (mode) {
    case "OWNED":
      return "success" as const;
    case "SHADOW":
      return "warning" as const;
    case "EXTERNAL":
    default:
      return "info" as const;
  }
}

function parseInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export function EditAdapterModal({
  adapter,
  isOpen,
  onClose,
  onSave,
}: EditAdapterModalProps) {
  const { locale } = useTranslation();
  const [editedAdapter, setEditedAdapter] = useState<PlatformAdapter | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (adapter && isOpen) {
      setEditedAdapter(JSON.parse(JSON.stringify(adapter)) as PlatformAdapter);
      setError(null);
      setSaving(false);
    }
  }, [adapter, isOpen]);

  const copy = useMemo(
    () =>
      locale === "en"
        ? {
            drawerEyebrow: "Adapter edit lane",
            drawerDescription:
              "Keep live health, authority, and rollout context visible while only mutating supported config and policy fields.",
            name: "Name",
            version: "Version",
            enabled: "Enabled",
            rolloutStatus: "Rollout status",
            credentialStatus: "Credential status",
            webhookTitle: "Webhook settings",
            webhookEnabled: "Webhook enabled",
            webhookUrl: "Webhook URL",
            policyTitle: "Policy settings",
            serviceBuckets: "Service buckets",
            serviceBucketsHint: "Comma-separated service bucket ids.",
            maxCandidates: "Max candidates",
            acceptTimeout: "Accept timeout (seconds)",
            fallbackThreshold: "Manual fallback threshold (seconds)",
            supportedActions: "Supported actions",
            supportedActionsEmpty:
              "No adapter actions are enabled for this platform.",
            financeAuthority: "Finance authority",
            rolloutStage: "Rollout stage",
            adapterType: "Adapter type",
            environment: "Environment",
            cancel: "Cancel",
            save: "Save adapter",
            saving: "Saving...",
            close: "Close editor",
            errorTitle: "Save failed",
            guardrailTitle: "Only supported config is editable here",
            guardrailDescription:
              "Credential state, live health, and authority posture remain review context. This drawer edits only the explicit adapter update command fields.",
            overlayLabel: "Adapter editor overlay",
          }
        : {
            drawerEyebrow: "Adapter 編輯",
            drawerDescription:
              "在保留 live health、authority 與 rollout 脈絡的同時，只編輯目前 command 支援的 config 與 policy 欄位。",
            name: "名稱",
            version: "版本",
            enabled: "啟用",
            rolloutStatus: "Rollout 狀態",
            credentialStatus: "憑證狀態",
            webhookTitle: "Webhook 設定",
            webhookEnabled: "Webhook 啟用",
            webhookUrl: "Webhook URL",
            policyTitle: "Policy 設定",
            serviceBuckets: "Service buckets",
            serviceBucketsHint: "以逗號分隔 service bucket id。",
            maxCandidates: "最大候選數",
            acceptTimeout: "Accept timeout（秒）",
            fallbackThreshold: "手動 fallback 門檻（秒）",
            supportedActions: "支援動作",
            supportedActionsEmpty: "這個平台目前沒有開啟任何 adapter action。",
            financeAuthority: "財務 authority",
            rolloutStage: "Rollout stage",
            adapterType: "Adapter 類型",
            environment: "環境",
            cancel: "取消",
            save: "儲存 adapter",
            saving: "儲存中...",
            close: "關閉編輯器",
            errorTitle: "儲存失敗",
            guardrailTitle: "這裡只允許編輯支援中的 config",
            guardrailDescription:
              "憑證狀態、live health 與 authority posture 只做 review context；drawer 只改 adapter update command 允許的欄位。",
            overlayLabel: "Adapter 編輯覆層",
          },
    [locale],
  );

  if (!isOpen || !editedAdapter) {
    return null;
  }

  const handleInputChange = (
    field: string,
    value: string | boolean | number,
  ) => {
    setEditedAdapter((previous) => {
      if (!previous) {
        return null;
      }

      if (field === "policies.serviceBuckets") {
        return {
          ...previous,
          policies: {
            ...previous.policies,
            serviceBuckets: String(value)
              .split(",")
              .map((entry) => entry.trim())
              .filter(Boolean),
          },
        };
      }

      if (field.includes(".")) {
        const [outerKey, innerKey] = field.split(".") as [
          keyof PlatformAdapter,
          string,
        ];
        const outerValue = previous[outerKey];

        return {
          ...previous,
          [outerKey]: {
            ...(typeof outerValue === "object" && outerValue !== null
              ? (outerValue as Record<string, unknown>)
              : {}),
            [innerKey]: value,
          },
        };
      }

      return {
        ...previous,
        [field]: value,
      };
    });
  };

  async function handleSave() {
    const current = editedAdapter;
    if (!current) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const updateCommand: UpdatePlatformAdapterCommand = {
        config: { isEnabled: current.config.isEnabled },
        rolloutStatus: current.rolloutStatus,
        policies: {
          serviceBuckets: current.policies.serviceBuckets,
          maxCandidates: current.policies.maxCandidates,
          acceptTimeoutSeconds: current.policies.acceptTimeoutSeconds,
          manualFallbackThresholdSeconds:
            current.policies.manualFallbackThresholdSeconds,
          financeAuthorityMode: current.policies.financeAuthorityMode,
        },
      };

      if (current.webhookStatus) {
        updateCommand.webhookStatus = {
          url: current.webhookStatus.url,
          isEnabled: current.webhookStatus.isEnabled,
        };
      }

      await onSave(updateCommand);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      role="presentation"
      aria-label={copy.overlayLabel}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(15, 23, 42, 0.58)",
        backdropFilter: "blur(4px)",
        padding: "24px 16px",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <WorkflowDetailDrawer
        ariaLabel={editedAdapter.name}
        eyebrow={copy.drawerEyebrow}
        title={`${editedAdapter.name} · ${editedAdapter.platformCode}`}
        description={copy.drawerDescription}
        tone="warning"
        density="comfortable"
        style={{
          width: "min(780px, 100%)",
          maxHeight: "min(90vh, 940px)",
        }}
        meta={
          <>
            <StatusChip
              tone={toneForRollout(editedAdapter.rolloutStatus)}
              label={formatPlatformCodeLabel(
                locale,
                editedAdapter.rolloutStatus,
              )}
              authorityLabel={copy.rolloutStatus}
            />
            <StatusChip
              tone={toneForCredential(editedAdapter.credentialStatus)}
              label={formatPlatformCodeLabel(
                locale,
                editedAdapter.credentialStatus,
              )}
              authorityLabel={copy.credentialStatus}
            />
          </>
        }
        headerActions={
          <button
            type="button"
            onClick={onClose}
            style={actionButtonStyle({ tone: "secondary", size: "sm" })}
          >
            {copy.close}
          </button>
        }
        footer={
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "8px",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={actionButtonStyle({ tone: "secondary" })}
            >
              {copy.cancel}
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              style={actionButtonStyle({ tone: "primary" })}
            >
              {saving ? copy.saving : copy.save}
            </button>
          </div>
        }
      >
        {error ? (
          <CalloutBanner tone="danger" title={`${copy.errorTitle}: ${error}`} />
        ) : null}

        <CalloutBanner
          tone="warning"
          title={copy.guardrailTitle}
          description={copy.guardrailDescription}
        />

        <DetailMetadataGrid
          columns={2}
          minColumnWidth="220px"
          items={[
            {
              id: "name",
              label: copy.name,
              value: editedAdapter.name,
            },
            {
              id: "version",
              label: copy.version,
              value: editedAdapter.version,
            },
            {
              id: "adapter-type",
              label: copy.adapterType,
              value: formatPlatformCodeLabel(locale, editedAdapter.adapterType),
            },
            {
              id: "environment",
              label: copy.environment,
              value: formatPlatformCodeLabel(locale, editedAdapter.environment),
            },
            {
              id: "authority",
              label: copy.financeAuthority,
              value: (
                <AuthorityAwareValue
                  label={formatPlatformCodeLabel(
                    locale,
                    editedAdapter.policies.financeAuthorityMode,
                  )}
                  tone={toneForAuthority(
                    editedAdapter.policies.financeAuthorityMode,
                  )}
                />
              ),
            },
            {
              id: "rollout-stage",
              label: copy.rolloutStage,
              value: formatPlatformCodeLabel(
                locale,
                editedAdapter.rolloutStage,
              ),
            },
          ]}
        />

        <div style={{ display: "grid", gap: "12px" }}>
          <div
            style={{
              display: "grid",
              gap: "6px",
              padding: "14px 16px",
              border: "1px solid rgba(148, 163, 184, 0.3)",
              borderRadius: "16px",
              background: "#f8fafc",
            }}
          >
            <div style={fieldLabelStyle}>{copy.enabled}</div>
            <label
              htmlFor="adapter-enabled"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "12px",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "grid", gap: "4px" }}>
                <strong>
                  {editedAdapter.config.isEnabled
                    ? getPlatformLabel(locale, "enabled")
                    : getPlatformLabel(locale, "disabled")}
                </strong>
                <span style={textMutedStyle}>
                  {locale === "en"
                    ? "Toggles whether this adapter can participate in platform workflows."
                    : "切換此 adapter 是否能參與平台流程。"}
                </span>
              </div>
              <span style={{ position: "relative", display: "inline-flex" }}>
                <input
                  id="adapter-enabled"
                  type="checkbox"
                  checked={editedAdapter.config.isEnabled}
                  onChange={(event) =>
                    handleInputChange("config.isEnabled", event.target.checked)
                  }
                  style={{
                    ...switchStyle.root(editedAdapter.config.isEnabled),
                    position: "relative",
                  }}
                />
                <span
                  aria-hidden="true"
                  style={switchStyle.thumb(editedAdapter.config.isEnabled)}
                />
              </span>
            </label>
          </div>

          <div
            style={{
              display: "grid",
              gap: "14px",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            }}
          >
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={fieldLabelStyle}>{copy.rolloutStatus}</span>
              <select
                value={editedAdapter.rolloutStatus}
                onChange={(event) =>
                  handleInputChange(
                    "rolloutStatus",
                    event.target.value as PlatformAdapter["rolloutStatus"],
                  )
                }
                style={inputStyle}
              >
                {Object.values(RolloutStatus).map((status) => (
                  <option key={status} value={status}>
                    {formatPlatformCodeLabel(locale, status)}
                  </option>
                ))}
              </select>
            </label>

            <div style={{ display: "grid", gap: "6px" }}>
              <span style={fieldLabelStyle}>{copy.credentialStatus}</span>
              <div
                style={{
                  ...inputStyle,
                  display: "flex",
                  alignItems: "center",
                  minHeight: "42px",
                }}
              >
                <StatusChip
                  tone={toneForCredential(editedAdapter.credentialStatus)}
                  label={formatPlatformCodeLabel(
                    locale,
                    editedAdapter.credentialStatus,
                  )}
                />
              </div>
            </div>
          </div>
        </div>

        <SectionBlock title={copy.webhookTitle}>
          <div
            style={{
              display: "grid",
              gap: "14px",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            }}
          >
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={fieldLabelStyle}>{copy.webhookEnabled}</span>
              <select
                value={
                  editedAdapter.webhookStatus?.isEnabled ? "true" : "false"
                }
                onChange={(event) =>
                  handleInputChange(
                    "webhookStatus.isEnabled",
                    event.target.value === "true",
                  )
                }
                style={inputStyle}
              >
                <option value="true">
                  {getPlatformLabel(locale, "enabled")}
                </option>
                <option value="false">
                  {getPlatformLabel(locale, "disabled")}
                </option>
              </select>
            </label>
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={fieldLabelStyle}>{copy.webhookUrl}</span>
              <input
                type="url"
                value={editedAdapter.webhookStatus?.url ?? ""}
                onChange={(event) =>
                  handleInputChange("webhookStatus.url", event.target.value)
                }
                style={{
                  ...inputStyle,
                  ...(editedAdapter.webhookStatus?.url ? monoTextStyle : {}),
                }}
                placeholder="https://example.com/webhook"
              />
            </label>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            <StatusChip
              tone={toneForWebhook(editedAdapter.webhookStatus?.isEnabled)}
              label={
                editedAdapter.webhookStatus?.isEnabled
                  ? getPlatformLabel(locale, "enabled")
                  : getPlatformLabel(locale, "disabled")
              }
              authorityLabel={copy.webhookEnabled}
            />
          </div>
        </SectionBlock>

        <SectionBlock title={copy.policyTitle}>
          <div
            style={{
              display: "grid",
              gap: "14px",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            }}
          >
            <label
              style={{ display: "grid", gap: "6px", gridColumn: "1 / -1" }}
            >
              <span style={fieldLabelStyle}>{copy.serviceBuckets}</span>
              <input
                type="text"
                value={editedAdapter.policies.serviceBuckets.join(", ")}
                onChange={(event) =>
                  handleInputChange(
                    "policies.serviceBuckets",
                    event.target.value,
                  )
                }
                style={inputStyle}
              />
              <span style={textMutedStyle}>{copy.serviceBucketsHint}</span>
            </label>
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={fieldLabelStyle}>{copy.maxCandidates}</span>
              <input
                type="number"
                value={editedAdapter.policies.maxCandidates}
                onChange={(event) =>
                  handleInputChange(
                    "policies.maxCandidates",
                    parseInteger(
                      event.target.value,
                      editedAdapter.policies.maxCandidates,
                    ),
                  )
                }
                style={inputStyle}
              />
            </label>
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={fieldLabelStyle}>{copy.acceptTimeout}</span>
              <input
                type="number"
                value={editedAdapter.policies.acceptTimeoutSeconds}
                onChange={(event) =>
                  handleInputChange(
                    "policies.acceptTimeoutSeconds",
                    parseInteger(
                      event.target.value,
                      editedAdapter.policies.acceptTimeoutSeconds,
                    ),
                  )
                }
                style={inputStyle}
              />
            </label>
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={fieldLabelStyle}>{copy.fallbackThreshold}</span>
              <input
                type="number"
                value={editedAdapter.policies.manualFallbackThresholdSeconds}
                onChange={(event) =>
                  handleInputChange(
                    "policies.manualFallbackThresholdSeconds",
                    parseInteger(
                      event.target.value,
                      editedAdapter.policies.manualFallbackThresholdSeconds,
                    ),
                  )
                }
                style={inputStyle}
              />
            </label>
          </div>
        </SectionBlock>

        <SectionBlock title={copy.supportedActions}>
          <div
            style={{
              display: "grid",
              gap: "10px",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            }}
          >
            {editedAdapter.supportedActions.length > 0 ? (
              editedAdapter.supportedActions.map((action) => (
                <div
                  key={action.name}
                  style={{
                    padding: "12px 14px",
                    borderRadius: "14px",
                    border: "1px solid rgba(148, 163, 184, 0.3)",
                    background: "#f8fafc",
                  }}
                >
                  <DataCellStack
                    primary={<strong>{action.name}</strong>}
                    secondary={action.description}
                  />
                </div>
              ))
            ) : (
              <div style={textMutedStyle}>{copy.supportedActionsEmpty}</div>
            )}
          </div>
        </SectionBlock>
      </WorkflowDetailDrawer>
    </div>
  );
}

function SectionBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ display: "grid", gap: "12px" }}>
      <div style={fieldLabelStyle}>{title}</div>
      {children}
    </section>
  );
}

function AuthorityAwareValue({
  label,
  tone,
}: {
  label: string;
  tone: "success" | "warning" | "info";
}) {
  return <StatusChip tone={tone} label={label} />;
}
