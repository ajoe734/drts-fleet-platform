import Link from "next/link";
import {
  EBtnContent,
  ECard,
  EIcon,
  EInput,
  EPill,
  ESeg,
  entBtnStyle,
} from "@/components/ent-kit";
import { EntPageHead } from "@/components/enterprise-shell";
import {
  getBookingStateMeta,
  getEnterpriseBookings,
} from "@/lib/enterprise-fixtures";
import { enterpriseTheme as t } from "@/lib/enterprise-theme";
import { getServerLocale } from "@/lib/server-locale";
import { type TranslationKey, t as translate } from "@/lib/translations";

const COLS = "110px 1.1fr 1.5fr 110px 130px 110px";

export default async function BookingsHistoryPage() {
  const locale = await getServerLocale();
  const tr = (key: TranslationKey, params?: Record<string, string | number>) =>
    translate(key, params, locale);
  const bookings = getEnterpriseBookings(locale);
  const stateMeta = getBookingStateMeta(locale);

  return (
    <>
      <EntPageHead
        title={tr("bookings.title")}
        sub={tr("bookings.subtitle")}
        actions={
          <Link
            href="/bookings/new"
            style={entBtnStyle(t, { variant: "primary" })}
          >
            <EBtnContent icon="plus">{tr("bookings.create")}</EBtnContent>
          </Link>
        }
      />
      <div
        style={{
          display: "flex",
          gap: 10,
          marginBottom: 16,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <ESeg
          t={t}
          value="all"
          options={[
            { value: "all", label: tr("bookings.filter.all") },
            { value: "mine", label: tr("bookings.filter.mine") },
            { value: "byme", label: tr("bookings.filter.byme") },
          ]}
        />
        <div style={{ flex: 1 }} />
        <EInput t={t} icon="search" placeholder={tr("bookings.search")} />
      </div>
      <ECard t={t} pad={0}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: COLS,
            gap: 12,
            padding: "11px 18px",
            borderBottom: "1px solid " + t.line,
            background: t.surfaceLo,
            fontSize: 11,
            fontWeight: 700,
            color: t.muted,
            letterSpacing: 0.3,
          }}
        >
          <span>{tr("bookings.col.id")}</span>
          <span>{tr("bookings.col.passenger")}</span>
          <span>{tr("bookings.col.route")}</span>
          <span>{tr("bookings.col.time")}</span>
          <span>{tr("bookings.col.costCenter")}</span>
          <span>{tr("bookings.col.state")}</span>
        </div>
        {bookings.map((b, i) => (
          <Link
            key={b.id}
            href={`/bookings/${b.id}`}
            style={{
              display: "grid",
              gridTemplateColumns: COLS,
              gap: 12,
              padding: "13px 18px",
              borderTop: i ? "1px solid " + t.lineSoft : "none",
              alignItems: "center",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <span
              style={{
                fontFamily: t.mono,
                fontSize: 12,
                color: t.primary,
                fontWeight: 600,
              }}
            >
              {b.id}
            </span>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {b.passenger}
              </div>
              <div style={{ fontSize: 11, color: b.self ? t.muted : t.warn }}>
                {b.self
                  ? tr("party.self")
                  : tr("home.upcoming.delegateShort", { name: b.bookedBy })}
              </div>
            </div>
            <div style={{ fontSize: 12, color: t.ink2, minWidth: 0 }}>
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {b.from}
                <EIcon
                  name="arrow"
                  size={11}
                  style={{ color: t.faint, flexShrink: 0 }}
                />
                {b.to}
                {b.flight && (
                  <EIcon
                    name="flag"
                    size={12}
                    style={{ color: t.info, flexShrink: 0 }}
                  />
                )}
              </span>
            </div>
            <span style={{ fontSize: 12, fontFamily: t.mono, color: t.ink2 }}>
              {b.window}
            </span>
            <span
              style={{ fontSize: 11.5, fontFamily: t.mono, color: t.muted }}
            >
              {b.costCenter}
            </span>
            <EPill t={t} tone={stateMeta[b.state].tone} dot>
              {stateMeta[b.state].label}
            </EPill>
          </Link>
        ))}
      </ECard>
    </>
  );
}
