"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState, type CSSProperties } from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
import type { PlatformAdminTenantRecord } from "@drts/contracts";
import {
  CanvasBanner,
  CanvasCard,
  CanvasDL,
  CanvasPageHeader,
  CanvasPill,
  CanvasShell,
  buildCanvasTheme,
  type CanvasShellNavItem,
} from "@drts/ui-web";

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });

const shellStyle = {
  margin: "-32px",
  minHeight: "calc(100vh - 64px)",
} satisfies CSSProperties;

const pageStackStyle = {
  display: "grid",
  gap: 16,
  padding: 24,
} satisfies CSSProperties;

function buildPlatformNav(locale: string): CanvasShellNavItem[] {
  return [
    { divider: locale === "en" ? "Workspace" : "工作面" },
    {
      key: "home",
      href: "/",
      icon: "home",
      label: locale === "en" ? "Governance Home" : "工作首頁",
    },
    { divider: locale === "en" ? "Tenant Governance" : "租戶治理" },
    {
      key: "tenants",
      href: "/tenants",
      icon: "tenants",
      label: locale === "en" ? "Tenants" : "租戶",
    },
    {
      key: "tenant-governance",
      href: "/tenant-governance",
      icon: "governance",
      label: locale === "en" ? "Cross-tenant governance" : "跨租戶治理",
    },
  ];
}

function gateStatus(tenant: PlatformAdminTenantRecord) {
  switch (tenant.rollout.stage) {
    case "sandbox":
      return tenant.rollout.sandboxStatus;
    case "pilot":
      return tenant.rollout.pilotStatus;
    case "production":
    default:
      return tenant.rollout.productionStatus;
  }
}

export default function TenantDetailPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { locale } = useTranslation();
  const client = usePlatformAdminClient();
  const [tenant, setTenant] = useState<PlatformAdminTenantRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string>("");

  useEffect(() => {
    let active = true;

    void params.then(async ({ tenantId: resolvedTenantId }) => {
      if (!active) {
        return;
      }

      setTenantId(resolvedTenantId);

      try {
        const record = await client.getPlatformTenant(resolvedTenantId);
        if (active) {
          setTenant(record);
          setError(null);
        }
      } catch (caughtError: unknown) {
        if (active) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : String(caughtError),
          );
        }
      }
    });

    return () => {
      active = false;
    };
  }, [client, params]);

  const navItems = useMemo(() => buildPlatformNav(locale), [locale]);

  return (
    <CanvasShell
      theme={theme}
      nav={navItems}
      active="tenants"
      currentPath={tenantId ? `/tenants/${tenantId}` : "/tenants"}
      breadcrumb={[
        locale === "en" ? "Tenant governance" : "租戶治理",
        locale === "en" ? "Tenants" : "租戶",
        tenant?.name ?? tenantId,
      ]}
      brandLabel="DRTS Fleet"
      brandSubLabel="Platform Admin"
      brandMark="PA"
      avatarLabel="PA"
      style={shellStyle}
    >
      <CanvasPageHeader
        theme={theme}
        title={
          tenant?.name ??
          tenantId ??
          (locale === "en" ? "Tenant detail" : "租戶詳情")
        }
        subtitle={
          tenant
            ? `${tenant.code} · ${tenant.id}`
            : locale === "en"
              ? "Loading tenant workspace"
              : "載入租戶 workspace"
        }
      />

      <div style={pageStackStyle}>
        {error ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            icon="warn"
            title={locale === "en" ? "Unable to load tenant" : "無法載入租戶"}
            body={error}
          />
        ) : null}

        {tenant ? (
          <>
            <CanvasCard
              theme={theme}
              title={locale === "en" ? "Lifecycle snapshot" : "Lifecycle 快照"}
              subtitle={
                locale === "en"
                  ? "Minimal detail route restored so tenants list can exit into a valid workspace."
                  : "先恢復最小可用 detail route，讓 tenants list 的 exit path 不再 404。"
              }
            >
              <CanvasDL
                theme={theme}
                cols={2}
                items={[
                  { k: "TENANT", v: tenant.name },
                  { k: "CODE", v: tenant.code, mono: true },
                  {
                    k: "STATUS",
                    v: formatPlatformCodeLabel(locale, tenant.status),
                  },
                  {
                    k: "ROLLOUT",
                    v: formatPlatformCodeLabel(locale, tenant.rollout.stage),
                  },
                  {
                    k: "GATE",
                    v: formatPlatformCodeLabel(locale, gateStatus(tenant)),
                  },
                  {
                    k: "UPDATED",
                    v: formatDateTime(tenant.updatedAt),
                    mono: true,
                  },
                  {
                    k: "CUTOVER OWNER",
                    v: tenant.rollout.cutoverOwner ?? "—",
                    mono: true,
                  },
                  {
                    k: "ROLLBACK OWNER",
                    v: tenant.rollout.rollbackOwner ?? "—",
                    mono: true,
                  },
                ]}
              />
            </CanvasCard>

            <CanvasCard
              theme={theme}
              title={locale === "en" ? "Modules & integration" : "模組與介接"}
            >
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  marginBottom: 12,
                }}
              >
                {tenant.enabledModules.map((moduleCode) => (
                  <CanvasPill key={moduleCode} theme={theme} tone="accent" dot>
                    {formatPlatformCodeLabel(locale, moduleCode)}
                  </CanvasPill>
                ))}
              </div>
              <CanvasDL
                theme={theme}
                cols={2}
                items={[
                  {
                    k: "INTEGRATION MODE",
                    v: formatPlatformCodeLabel(
                      locale,
                      tenant.integrationPackage.mode,
                    ),
                  },
                  {
                    k: "SANDBOX URL",
                    v: tenant.integrationPackage.sandboxBaseUrl ?? "—",
                    mono: true,
                  },
                  {
                    k: "PRODUCTION URL",
                    v: tenant.integrationPackage.productionBaseUrl ?? "—",
                    mono: true,
                  },
                  {
                    k: "BACK TO LIST",
                    v: (
                      <Link href="/tenants" style={{ color: theme.accent }}>
                        /tenants
                      </Link>
                    ),
                  },
                ]}
              />
            </CanvasCard>
          </>
        ) : null}
      </div>
    </CanvasShell>
  );
}
