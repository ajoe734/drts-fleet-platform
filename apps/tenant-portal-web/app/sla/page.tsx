import Link from "next/link";
import { AppShellCard } from "@drts/ui-web";
import { getSlaProfile, updateSlaProfile } from "./actions";
import type { TenantSlaProfile } from "@drts/contracts";
import { describeRoleSnapshot, getTenantRoleSnapshot } from "@/lib/rbac";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import type { Locale } from "@/lib/translations";

export default async function SlaPage() {
  const locale = await getServerLocale();
  const { profile, error: fetchError } = await getSlaProfile();
  const roleSnapshot = await getTenantRoleSnapshot();

  return (
    <main className="app-grid">
      <AppShellCard
        title={t("sla.title", locale)}
        description={
          roleSnapshot.capabilities.canWriteSla
            ? t("sla.description.write", locale)
            : t("sla.description.readonly", locale, {
                role: describeRoleSnapshot(roleSnapshot, locale),
              })
        }
      >
        {fetchError && (
          <div className="error-banner">
            <strong>{t("sla.error.loading", locale)}</strong> {fetchError}
          </div>
        )}

        <div className="source-guidance">
          <strong>{t("sla.guidance.title", locale)}</strong>{" "}
          {t("sla.guidance.body", locale)}
        </div>

        {profile && <SlaProfileTable profile={profile} locale={locale} />}

        <UpdateSlaForm
          profile={profile}
          canWrite={roleSnapshot.capabilities.canWriteSla}
          locale={locale}
        />

        <Link className="route-link" href="/" style={{ marginTop: "1rem" }}>
          <strong>{t("sla.backHome.title", locale)}</strong>
          {t("sla.backHome.body", locale)}
        </Link>
      </AppShellCard>
    </main>
  );
}

function SlaProfileTable({
  profile,
  locale,
}: {
  profile: TenantSlaProfile;
  locale: Locale;
}) {
  return (
    <div className="data-table" style={{ marginBottom: "1rem" }}>
      <table>
        <thead>
          <tr>
            <th>{t("sla.table.metric", locale)}</th>
            <th>{t("sla.table.thresholdMinutes", locale)}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{t("sla.metric.waitThreshold", locale)}</td>
            <td>
              {t("sla.value.minutes", locale, {
                count: profile.waitThresholdMin,
              })}
            </td>
          </tr>
          <tr>
            <td>{t("sla.metric.arrivalThreshold", locale)}</td>
            <td>
              {t("sla.value.minutes", locale, {
                count: profile.arrivalThresholdMin,
              })}
            </td>
          </tr>
          <tr>
            <td>{t("sla.metric.completionThreshold", locale)}</td>
            <td>
              {t("sla.value.minutes", locale, {
                count: profile.completionThresholdMin,
              })}
            </td>
          </tr>
          <tr>
            <td>{t("sla.metric.lastUpdated", locale)}</td>
            <td>
              {profile.updatedAt
                ? new Date(profile.updatedAt).toLocaleString()
                : "-"}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function UpdateSlaForm({
  profile,
  canWrite,
  locale,
}: {
  profile: TenantSlaProfile | null;
  canWrite: boolean;
  locale: Locale;
}) {
  return (
    <form action={updateSlaProfile}>
      <div className="data-table">
        <table>
          <thead>
            <tr>
              <th>{t("sla.table.metric", locale)}</th>
              <th>{t("sla.table.newValueMinutes", locale)}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <label htmlFor="waitThresholdMin">
                  {t("sla.metric.waitTime", locale)}
                </label>
              </td>
              <td>
                <input
                  type="number"
                  id="waitThresholdMin"
                  name="waitThresholdMin"
                  min={1}
                  defaultValue={profile?.waitThresholdMin ?? 15}
                  style={{ width: "100px" }}
                />
              </td>
            </tr>
            <tr>
              <td>
                <label htmlFor="arrivalThresholdMin">
                  {t("sla.metric.arrivalTime", locale)}
                </label>
              </td>
              <td>
                <input
                  type="number"
                  id="arrivalThresholdMin"
                  name="arrivalThresholdMin"
                  min={1}
                  defaultValue={profile?.arrivalThresholdMin ?? 30}
                  style={{ width: "100px" }}
                />
              </td>
            </tr>
            <tr>
              <td>
                <label htmlFor="completionThresholdMin">
                  {t("sla.metric.completionTime", locale)}
                </label>
              </td>
              <td>
                <input
                  type="number"
                  id="completionThresholdMin"
                  name="completionThresholdMin"
                  min={1}
                  defaultValue={profile?.completionThresholdMin ?? 60}
                  style={{ width: "100px" }}
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: "1rem" }}>
        <button type="submit" className="btn-primary" disabled={!canWrite}>
          {canWrite
            ? t("sla.action.update", locale)
            : t("sla.action.readonly", locale)}
        </button>
      </div>
    </form>
  );
}
