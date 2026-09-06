import { EStepper } from "@/components/ent-kit";
import { EnterpriseBookingForm } from "@/components/enterprise-booking-form";
import { EntPageHead } from "@/components/enterprise-shell";
import {
  createEnterpriseBookingDraft,
  parseEnterpriseBookingDraft,
} from "@/lib/enterprise-booking-draft";
import {
  getEnterpriseAddresses,
  getEnterpriseCostCenters,
  getEnterprisePassengers,
} from "@/lib/enterprise-fixtures";
import { enterpriseTheme as t } from "@/lib/enterprise-theme";
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
      : createEnterpriseBookingDraft(locale);

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
      <div className="ent-booking-form-shell">
        <EnterpriseBookingForm
          initialDraft={initialDraft}
          passengers={getEnterprisePassengers(locale)}
          addresses={getEnterpriseAddresses(locale)}
          costCenters={getEnterpriseCostCenters(locale)}
          {...(bookingId ? { bookingId } : {})}
        />
      </div>
    </>
  );
}
