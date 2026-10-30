import { cookies } from "next/headers";
import { EStepper } from "@/components/ent-kit";
import { EnterpriseBookingForm } from "@/components/booking-form";
import { EntPageHead } from "@/components/enterprise-shell";
import {
  createEnterpriseBookingDraft,
  parseEnterpriseBookingDraft,
} from "@/lib/enterprise-booking-draft";
import {
  createEnterpriseDispatchSessionClient,
  type EnterpriseBookingDirectory,
} from "@/lib/api-client";
import {
  ENTERPRISE_TENANT_SESSION_COOKIE,
  verifyEnterpriseTenantSession,
} from "@/lib/enterprise-session.server";
import { tenantEnterpriseTheme as t } from "@/components/booking-form/theme";
import { getServerLocale } from "@/lib/server-locale";
import { type TranslationKey, t as translate } from "@/lib/translations";

type NewBookingSearchParams = Record<string, string | string[] | undefined>;

export default async function NewBookingPage({
  searchParams,
}: {
  searchParams?: Promise<NewBookingSearchParams>;
}) {
  const locale = await getServerLocale();
  const tr = (key: TranslationKey, params?: Record<string, string | number>) =>
    translate(key, params, locale);
  const resolvedSearchParams = (await searchParams) ?? {};
  const bookingId = Array.isArray(resolvedSearchParams.bookingId)
    ? resolvedSearchParams.bookingId[0]
    : resolvedSearchParams.bookingId;

  const initialDraft =
    Object.keys(resolvedSearchParams).length > 0
      ? parseEnterpriseBookingDraft(resolvedSearchParams, locale)
      : createEnterpriseBookingDraft(locale, { entry: "self" });

  if (!Object.prototype.hasOwnProperty.call(resolvedSearchParams, "cc")) {
    initialDraft.costCenterCode = "";
    initialDraft.costCenterLabel = "";
  }

  let directory: EnterpriseBookingDirectory = {
    passengers: [],
    addresses: [],
    costCenters: [],
  };
  let directoryUnavailable = false;
  try {
    const cookieStore = await cookies();
    const verified = await verifyEnterpriseTenantSession(
      cookieStore.get(ENTERPRISE_TENANT_SESSION_COOKIE)?.value,
    );
    if (verified.session) {
      directory = await createEnterpriseDispatchSessionClient(
        verified.session,
      ).getBookingDirectory();
    } else {
      directoryUnavailable = true;
    }
  } catch {
    directoryUnavailable = true;
  }

  return (
    <>
      <EntPageHead
        back={tr("new.next.back")}
        title={tr("new.title")}
        sub={tr("new.subtitle")}
      />
      <div style={{ marginBottom: 20 }}>
        <EStepper
          t={t}
          steps={[
            tr("new.step.fill"),
            tr("new.step.confirm"),
            tr("new.step.submit"),
          ]}
          active={0}
        />
      </div>
      {directoryUnavailable ? (
        <div
          role="status"
          data-testid="enterprise-booking-directory-unavailable"
        >
          {tr("new.directoryUnavailable")}
        </div>
      ) : null}
      <EnterpriseBookingForm
        initialDraft={initialDraft}
        passengers={directory.passengers.filter((row) => row.activeFlag)}
        addresses={directory.addresses.filter((row) => row.activeFlag)}
        costCenters={directory.costCenters.filter((row) => row.activeFlag)}
        {...(bookingId ? { bookingId } : {})}
      />
    </>
  );
}
