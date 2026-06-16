import Link from "next/link";
import {
  EAvatar,
  EBtn,
  EBtnContent,
  ECard,
  EPill,
  entBtnStyle,
} from "@/components/ent-kit";
import { EntProgressRail, EntRoute } from "@/components/ent-screen-bits";
import { EntPageHead } from "@/components/enterprise-shell";
import {
  enterpriseDriver,
  getEnterpriseBookings,
} from "@/lib/enterprise-fixtures";
import { enterpriseTheme as t } from "@/lib/enterprise-theme";
import { getServerLocale } from "@/lib/server-locale";
import { type TranslationKey, t as translate } from "@/lib/translations";

export default async function TripPage() {
  const locale = await getServerLocale();
  const tr = (key: TranslationKey, params?: Record<string, string | number>) =>
    translate(key, params, locale);
  const bookings = getEnterpriseBookings(locale);
  const trip =
    bookings.find((b) => b.state === "enroute" || b.state === "assigned") ??
    bookings[0];
  if (!trip) {
    return null;
  }

  return (
    <>
      <EntPageHead title={tr("trip.title")} sub={tr("trip.subtitle")} />
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <ECard t={t} accent={t.primary}>
          <div style={{ padding: "6px 6px 4px" }}>
            <EntProgressRail
              t={t}
              active={2}
              stages={[
                { t: tr("trip.stage.assigned"), icon: "car" },
                { t: tr("trip.stage.enroute"), icon: "route" },
                { t: tr("trip.stage.arrived"), icon: "pin" },
                { t: tr("trip.stage.inprogress"), icon: "bolt" },
                { t: tr("trip.stage.completed"), icon: "check" },
              ]}
            />
          </div>
          <div
            style={{ height: 1, background: t.lineSoft, margin: "22px 0 18px" }}
          />
          <div
            style={{
              display: "flex",
              gap: 16,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 13,
                flex: 1,
                minWidth: 220,
              }}
            >
              <EAvatar t={t} name="張" size={50} />
              <div>
                <div style={{ fontSize: 15.5, fontWeight: 700 }}>
                  {enterpriseDriver.name}
                </div>
                <div
                  style={{ fontSize: 12, color: t.muted, fontFamily: t.mono }}
                >
                  {enterpriseDriver.vehicle}
                </div>
                <div style={{ marginTop: 5 }}>
                  <EPill t={t} tone="info" dot>
                    {tr("trip.stage.enroute")}
                  </EPill>
                </div>
              </div>
            </div>
            <div
              style={{
                textAlign: "center",
                background: t.primaryBg,
                border: "1px solid " + t.primaryBd,
                borderRadius: 14,
                padding: "12px 22px",
              }}
            >
              <div
                style={{
                  fontSize: 36,
                  fontWeight: 800,
                  fontFamily: t.mono,
                  color: t.primary,
                  lineHeight: 1,
                }}
              >
                {trip.etaMinutes ?? "—"}
              </div>
              <div style={{ fontSize: 11, color: t.muted, marginTop: 4 }}>
                {tr("trip.etaArrival")}
              </div>
            </div>
          </div>
          <div style={{ marginTop: 18 }}>
            <EntRoute
              t={t}
              from={trip.from}
              to={trip.to}
              win={trip.window}
              airportLabel={
                trip.flight ? `${trip.flight} · ${trip.terminal}` : undefined
              }
            />
          </div>
          <div style={{ marginTop: 18, display: "flex", gap: 10 }}>
            <EBtn t={t} variant="default" block icon="phone">
              {tr("trip.contactDriver")}
            </EBtn>
            <EBtn t={t} variant="default" block icon="brief">
              {tr("trip.contactSupport")}
            </EBtn>
            <Link
              href={`/bookings/${trip.id}`}
              style={entBtnStyle(t, { variant: "primary", block: true })}
            >
              <EBtnContent iconR="arrow">{tr("trip.detail")}</EBtnContent>
            </Link>
          </div>
          <div
            style={{
              fontSize: 11,
              color: t.faint,
              marginTop: 12,
              textAlign: "center",
            }}
          >
            {tr("trip.etaNote")}
          </div>
        </ECard>
      </div>
    </>
  );
}
