import Link from "next/link";
import {
  EBanner,
  EBtnContent,
  ECard,
  EField,
  EInput,
  EPill,
  ERow,
  ESeg,
  EStepper,
  entBtnStyle,
} from "@/components/ent-kit";
import { EntPageHead } from "@/components/enterprise-shell";
import {
  getEnterpriseAddresses,
  getEnterpriseBookingDraft,
  getEnterprisePassengers,
} from "@/lib/enterprise-fixtures";
import { enterpriseTheme as t } from "@/lib/enterprise-theme";
import { getServerLocale } from "@/lib/server-locale";
import { type TranslationKey, t as translate } from "@/lib/translations";

export default async function NewBookingPage() {
  const locale = await getServerLocale();
  const tr = (key: TranslationKey, params?: Record<string, string | number>) =>
    translate(key, params, locale);
  const draft = getEnterpriseBookingDraft(locale);
  const passengers = getEnterprisePassengers(locale);
  const addresses = getEnterpriseAddresses(locale);

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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.55fr 1fr",
          gap: 18,
          alignItems: "start",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <ECard
            t={t}
            title={tr("new.field.passenger")}
            sub={tr("card.sub.passenger")}
          >
            <ESeg
              t={t}
              full
              value="other"
              options={[
                {
                  value: "self",
                  label: tr("new.passenger.self"),
                  icon: "user",
                },
                {
                  value: "other",
                  label: tr("new.passenger.other"),
                  icon: "users",
                },
              ]}
            />
            <div style={{ height: 14 }} />
            <EField
              t={t}
              label={tr("new.passenger.choose")}
              req
              hint={tr("new.passenger.chooseHint")}
            >
              <EInput t={t} icon="search" value={draft.passenger} />
            </EField>
            <div
              style={{
                display: "flex",
                gap: 7,
                flexWrap: "wrap",
                marginTop: 12,
              }}
            >
              {passengers.map((p) => (
                <span
                  key={p}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    color: t.ink2,
                    background: t.surfaceLo,
                    border: "1px solid " + t.line,
                    padding: "5px 10px",
                    borderRadius: 999,
                  }}
                >
                  {p}
                </span>
              ))}
            </div>
          </ECard>

          <ECard
            t={t}
            title={tr("new.card.booking")}
            sub={tr("card.sub.pickupDropoffWindow")}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 14,
              }}
            >
              <EField t={t} label={tr("new.field.pickup")} req full>
                <EInput t={t} icon="pin" value={draft.pickup} />
              </EField>
              <EField t={t} label={tr("new.field.dropoff")} req full>
                <EInput t={t} icon="pin" value={draft.dropoff} />
              </EField>
              <EField t={t} label={tr("new.field.window")} req>
                <EInput t={t} icon="cal" value={draft.reservationWindow} mono />
              </EField>
              <EField t={t} label={tr("new.field.contact")} req>
                <EInput t={t} icon="phone" value="0912-880-114" mono />
              </EField>
            </div>
            <div
              style={{
                display: "flex",
                gap: 7,
                flexWrap: "wrap",
                marginTop: 12,
              }}
            >
              {addresses.map((a) => (
                <span
                  key={a}
                  style={{
                    fontSize: 11.5,
                    color: t.muted,
                    background: t.surfaceLo,
                    border: "1px solid " + t.line,
                    padding: "4px 9px",
                    borderRadius: 999,
                  }}
                >
                  {a}
                </span>
              ))}
            </div>
          </ECard>

          <ECard
            t={t}
            title={
              <span
                style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
              >
                {tr("new.field.airport")}
                <EPill t={t} tone="neutral">
                  {tr("new.airport.optional")}
                </EPill>
              </span>
            }
            sub={tr("new.airport.hint")}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 14,
              }}
            >
              <EField t={t} label={tr("new.airport.direction")}>
                <ESeg
                  t={t}
                  full
                  value="in"
                  options={[
                    { value: "out", label: tr("new.airport.outbound") },
                    { value: "in", label: tr("new.airport.inbound") },
                  ]}
                />
              </EField>
              <EField t={t} label={tr("new.airport.terminal")}>
                <EInput t={t} value={draft.terminal} />
              </EField>
              <EField t={t} label={tr("new.airport.flight")}>
                <EInput t={t} icon="flag" value={draft.flight} mono />
              </EField>
              <EField t={t} label={tr("new.airport.luggage")}>
                <EInput t={t} value={draft.luggage} />
              </EField>
            </div>
          </ECard>

          <ECard
            t={t}
            title={tr("new.card.policy")}
            sub={tr("card.sub.costVehicleNotes")}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 14,
              }}
            >
              <EField
                t={t}
                label={tr("new.field.costCenter")}
                req
                full
                hint={tr("new.costCenter.hint")}
              >
                <EInput t={t} icon="building" value={draft.costCenter} />
              </EField>
              <EField t={t} label={tr("new.field.bookedBy")}>
                <EInput t={t} icon="user" value={draft.bookedBy} />
              </EField>
              <EField t={t} label={tr("new.policy.vehicle")} full>
                <ESeg
                  t={t}
                  full
                  value="business"
                  options={[
                    { value: "sedan", label: tr("fixture.vehicle.standard") },
                    {
                      value: "business",
                      label: tr("fixture.vehicle.business"),
                    },
                    { value: "van", label: tr("fixture.vehicle.van") },
                  ]}
                />
              </EField>
              <EField t={t} label={tr("new.field.notes")} full>
                <EInput t={t} value={draft.notes} />
              </EField>
            </div>
          </ECard>
        </div>

        <div
          style={{
            position: "sticky",
            top: 76,
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <ECard
            t={t}
            title={tr("new.check.title")}
            sub={tr("card.sub.helperReads")}
          >
            <ERow
              t={t}
              k={tr("new.field.costCenter")}
              v={
                <EPill t={t} tone="success" dot>
                  {tr("new.check.valid")}
                </EPill>
              }
            />
            <ERow
              t={t}
              k={tr("new.check.quota")}
              v="NT$ 31,000 / 60,000"
              mono
            />
            <ERow
              t={t}
              k={tr("new.check.fare")}
              v={tr("new.check.fareValue")}
              mono
            />
            <ERow
              t={t}
              k={tr("new.check.impact")}
              v={tr("new.check.impactValue")}
            />
            <ERow
              t={t}
              k={tr("new.policy.approval")}
              v={
                <EPill t={t} tone="success" dot>
                  {tr("new.check.exempt")}
                </EPill>
              }
              last
            />
            <div style={{ marginTop: 12 }}>
              <EBanner
                t={t}
                tone="success"
                icon="check"
                body={tr("new.banner.body")}
              />
            </div>
          </ECard>
          <Link
            href="/bookings/review"
            style={entBtnStyle(t, {
              variant: "primary",
              size: "lg",
              block: true,
            })}
          >
            <EBtnContent iconR="arrow" size="lg">
              {tr("new.next.review")}
            </EBtnContent>
          </Link>
          <Link
            href="/"
            style={entBtnStyle(t, { variant: "ghost", block: true })}
          >
            <EBtnContent>{tr("new.next.cancel")}</EBtnContent>
          </Link>
        </div>
      </div>
    </>
  );
}
