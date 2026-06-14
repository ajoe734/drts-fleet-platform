import type {
  FeatureFlagSummary,
  TenantIntegrationGovernancePackage,
  TenantNotificationPreferences,
  TenantSlaProfile,
} from "@drts/contracts";
import { getTenantClient } from "@/lib/api-client";
import {
  FORMAL_TENANT_ROLE_FRAMING,
  describeRoleSnapshot,
  getTenantRoleSnapshot,
  roleCatalogLabels,
} from "@/lib/rbac";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import type { Locale } from "@/lib/translations";

export const dynamic = "force-dynamic";

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDateTime(value: string | null | undefined, locale: Locale) {
  if (!value) {
    return t("settings.dateTime.notAvailable", locale);
  }

  return DATE_TIME_FORMATTER.format(new Date(value));
}

export default async function SettingsPage() {
  const locale = await getServerLocale();
  const client = await getTenantClient();
  const roleSnapshot = await getTenantRoleSnapshot();
  const [preferencesResult, slaResult, governanceResult, flagsResult] =
    await Promise.allSettled([
      client.getNotificationPreferences() as Promise<TenantNotificationPreferences>,
      client.getSlaProfile() as Promise<TenantSlaProfile>,
      client.getTenantIntegrationGovernancePackage() as Promise<TenantIntegrationGovernancePackage>,
      client.getFeatureFlags() as Promise<FeatureFlagSummary>,
    ]);

  const preferences =
    preferencesResult.status === "fulfilled" ? preferencesResult.value : null;
  const sla = slaResult.status === "fulfilled" ? slaResult.value : null;
  const governance =
    governanceResult.status === "fulfilled" ? governanceResult.value : null;
  const flags = flagsResult.status === "fulfilled" ? flagsResult.value : null;

  const errors = [
    roleSnapshot.identityError,
    preferencesResult.status === "rejected"
      ? t("settings.error.notificationPreferences", locale, {
          message:
            preferencesResult.reason instanceof Error
              ? preferencesResult.reason.message
              : t("settings.error.unknown", locale),
        })
      : null,
    slaResult.status === "rejected"
      ? t("settings.error.slaProfile", locale, {
          message:
            slaResult.reason instanceof Error
              ? slaResult.reason.message
              : t("settings.error.unknown", locale),
        })
      : null,
    governanceResult.status === "rejected"
      ? t("settings.error.integrationGovernance", locale, {
          message:
            governanceResult.reason instanceof Error
              ? governanceResult.reason.message
              : t("settings.error.unknown", locale),
        })
      : null,
    flagsResult.status === "rejected"
      ? t("settings.error.featureFlags", locale, {
          message:
            flagsResult.reason instanceof Error
              ? flagsResult.reason.message
              : t("settings.error.unknown", locale),
        })
      : null,
  ].filter(Boolean) as string[];

  return (
    <main className="page-shell">
      <section className="page-hero">
        <span className="eyebrow">{t("settings.hero.eyebrow", locale)}</span>
        <h1>{t("settings.hero.title", locale)}</h1>
        <p>{t("settings.hero.description", locale)}</p>
      </section>

      {errors.length > 0 ? (
        <section className="callout-panel is-warning">
          <strong>{t("settings.error.heading", locale)}</strong>
          <ul className="panel-list">
            {errors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="surface-grid surface-grid-wide">
        <article className="surface-card">
          <span className="surface-kicker">
            {t("settings.roleModel.kicker", locale)}
          </span>
          <h3>{t("settings.roleModel.title", locale)}</h3>
          <p>
            {t("settings.roleModel.description", locale, {
              identity: describeRoleSnapshot(roleSnapshot, locale),
            })}
          </p>
          <ul className="panel-list">
            {FORMAL_TENANT_ROLE_FRAMING.map((roleFrame) => (
              <li key={roleFrame.key}>
                <strong>{t("role." + roleFrame.key + ".label", locale)}</strong>
                <span className="list-note">
                  {t("role." + roleFrame.key + ".summary", locale)}
                </span>
              </li>
            ))}
          </ul>
        </article>

        <article className="surface-card">
          <span className="surface-kicker">
            {t("settings.authority.kicker", locale)}
          </span>
          <h3>{t("settings.authority.title", locale)}</h3>
          <p>{t("settings.authority.description", locale)}</p>
          <div className="chip-row">
            {(() => {
              const catalogLabels = roleCatalogLabels(roleSnapshot, locale);
              return catalogLabels.length > 0 ? (
                catalogLabels.map((roleLabel) => (
                  <span className="status-chip" key={roleLabel}>
                    {roleLabel}
                  </span>
                ))
              ) : (
                <span className="status-chip">
                  {t("settings.authority.empty", locale)}
                </span>
              );
            })()}
          </div>
        </article>

        <article className="surface-card">
          <span className="surface-kicker">
            {t("settings.notifications.kicker", locale)}
          </span>
          <h3>{t("settings.notifications.title", locale)}</h3>
          <p>{t("settings.notifications.description", locale)}</p>
          {preferences ? (
            <>
              <ul className="panel-list">
                {preferences.subscriptions.map((subscription) => (
                  <li key={`${subscription.eventType}-${subscription.channel}`}>
                    <strong>{subscription.eventType}</strong>
                    <span className="list-note">
                      {subscription.channel} ·{" "}
                      {subscription.enabled
                        ? t("settings.notifications.enabled", locale)
                        : t("settings.notifications.disabled", locale)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="muted-copy">
                {t("settings.notifications.updated", locale, {
                  date: formatDateTime(preferences.updatedAt, locale),
                })}
              </p>
            </>
          ) : (
            <p className="muted-copy">
              {t("settings.notifications.unavailable", locale)}
            </p>
          )}
        </article>

        <article className="surface-card">
          <span className="surface-kicker">
            {t("settings.sla.kicker", locale)}
          </span>
          <h3>{t("settings.sla.title", locale)}</h3>
          <p>{t("settings.sla.description", locale)}</p>
          {sla ? (
            <dl className="definition-grid">
              <div>
                <dt>{t("settings.sla.waitThreshold", locale)}</dt>
                <dd>
                  {t("settings.sla.minutes", locale, {
                    count: sla.waitThresholdMin,
                  })}
                </dd>
              </div>
              <div>
                <dt>{t("settings.sla.arrivalThreshold", locale)}</dt>
                <dd>
                  {t("settings.sla.minutes", locale, {
                    count: sla.arrivalThresholdMin,
                  })}
                </dd>
              </div>
              <div>
                <dt>{t("settings.sla.completionThreshold", locale)}</dt>
                <dd>
                  {t("settings.sla.minutes", locale, {
                    count: sla.completionThresholdMin,
                  })}
                </dd>
              </div>
              <div>
                <dt>{t("settings.sla.updated", locale)}</dt>
                <dd>{formatDateTime(sla.updatedAt, locale)}</dd>
              </div>
            </dl>
          ) : (
            <p className="muted-copy">
              {t("settings.sla.unavailable", locale)}
            </p>
          )}
        </article>

        <article className="surface-card">
          <span className="surface-kicker">
            {t("settings.integration.kicker", locale)}
          </span>
          <h3>{t("settings.integration.title", locale)}</h3>
          <p>{t("settings.integration.description", locale)}</p>
          <div className="chip-row">
            {flags?.flags
              .filter((flag) => flag.enabled)
              .slice(0, 8)
              .map((flag) => (
                <span className="status-chip" key={flag.key}>
                  {flag.key}
                </span>
              ))}
          </div>
          {governance?.onboardingChecklist?.length ? (
            <ul className="panel-list">
              {governance.onboardingChecklist.slice(0, 4).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="muted-copy">
              {t("settings.integration.empty", locale)}
            </p>
          )}
        </article>
      </section>

      <section className="callout-panel">
        <strong>{t("settings.guardrail.heading", locale)}</strong>
        <p>{t("settings.guardrail.description", locale)}</p>
      </section>
    </main>
  );
}
