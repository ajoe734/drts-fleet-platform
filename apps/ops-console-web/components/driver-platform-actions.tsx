"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  DriverRegistryRecord,
  PlatformCode,
  PlatformPresenceStatus,
} from "@drts/contracts";
import { getOpsClient } from "@/lib/api-client";
import { useTranslation } from "@/lib/i18n";

type DriverPlatformActionsProps = {
  driverId: string;
  workState: DriverRegistryRecord["workState"];
  platformCode?: PlatformCode | undefined;
  platformStatus?: PlatformPresenceStatus | undefined;
};

const buttonStyle: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  borderRadius: "999px",
  background: "#fff",
  color: "#0f172a",
  padding: "0.45rem 0.8rem",
  fontSize: "0.82rem",
  fontWeight: 600,
  cursor: "pointer",
};

export function DriverPlatformActions({
  driverId,
  workState,
  platformCode,
  platformStatus,
}: DriverPlatformActionsProps) {
  const client = getOpsClient();
  const router = useRouter();
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function runAction(
    actionKey: string,
    runner: () => Promise<unknown>,
  ): Promise<void> {
    setPendingAction(actionKey);
    setError(null);
    try {
      await runner();
      startTransition(() => {
        router.refresh();
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("common.unknown"));
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: "0.5rem" }}>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {platformCode && platformStatus === "online" ? (
          <>
            <button
              type="button"
              style={buttonStyle}
              disabled={pendingAction !== null}
              onClick={() =>
                void runAction("take-offline", () =>
                  client.setPlatformOffline({ platformCode }, { driverId }),
                )
              }
            >
              {pendingAction === "take-offline"
                ? t("drivers.detail.refreshing")
                : t("drivers.detail.takeOffline")}
            </button>
            <button
              type="button"
              style={buttonStyle}
              disabled={pendingAction !== null}
              onClick={() =>
                void runAction("mark-reauth", () =>
                  client.setPlatformOnline(
                    {
                      platformCode,
                      tokenExpiresAt: new Date().toISOString(),
                    },
                    { driverId },
                  ),
                )
              }
            >
              {pendingAction === "mark-reauth"
                ? t("drivers.detail.refreshing")
                : t("drivers.detail.markReauth")}
            </button>
          </>
        ) : null}

        <button
          type="button"
          style={buttonStyle}
          disabled={pendingAction !== null}
          onClick={() =>
            void runAction("toggle-hold", () =>
              client.updateDriverWorkState(driverId, {
                workState:
                  workState === "incident_hold" ? "available" : "incident_hold",
              }),
            )
          }
        >
          {pendingAction === "toggle-hold"
            ? t("drivers.detail.refreshing")
            : workState === "incident_hold"
              ? t("drivers.detail.releaseHold")
              : t("drivers.detail.suppressMatching")}
        </button>
      </div>

      {error ? (
        <div style={{ color: "#b91c1c", fontSize: "0.82rem" }}>
          {t("drivers.detail.actionError")}: {error}
        </div>
      ) : null}
    </div>
  );
}

type DriverPlatformRowActionsProps = {
  driverId: string;
  platformCode: PlatformCode;
  platformStatus: PlatformPresenceStatus;
};

export function DriverPlatformRowActions({
  driverId,
  platformCode,
  platformStatus,
}: DriverPlatformRowActionsProps) {
  const client = getOpsClient();
  const router = useRouter();
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function runAction(
    actionKey: string,
    runner: () => Promise<unknown>,
  ): Promise<void> {
    setPendingAction(actionKey);
    setError(null);
    try {
      await runner();
      startTransition(() => {
        router.refresh();
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("common.unknown"));
    } finally {
      setPendingAction(null);
    }
  }

  if (platformStatus !== "online") {
    return null;
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
      <button
        type="button"
        style={buttonStyle}
        disabled={pendingAction !== null}
        onClick={() =>
          void runAction("offline", () =>
            client.setPlatformOffline({ platformCode }, { driverId }),
          )
        }
      >
        {pendingAction === "offline"
          ? t("drivers.detail.refreshing")
          : t("drivers.detail.takeOffline")}
      </button>
      <button
        type="button"
        style={buttonStyle}
        disabled={pendingAction !== null}
        onClick={() =>
          void runAction("reauth", () =>
            client.setPlatformOnline(
              { platformCode, tokenExpiresAt: new Date().toISOString() },
              { driverId },
            ),
          )
        }
      >
        {pendingAction === "reauth"
          ? t("drivers.detail.refreshing")
          : t("drivers.detail.markReauth")}
      </button>
      {error ? (
        <span style={{ color: "#b91c1c", fontSize: "0.78rem" }}>
          {t("drivers.detail.actionError")}: {error}
        </span>
      ) : null}
    </div>
  );
}
