import { EBanner, EBtn, ECard, EIcon } from "@/components/ent-kit";
import { EntPageHead } from "@/components/enterprise-shell";
import {
  enterpriseTenant,
  getEnterpriseSupportFaq,
} from "@/lib/enterprise-fixtures";
import { enterpriseTheme as t } from "@/lib/enterprise-theme";
import { getServerLocale } from "@/lib/server-locale";
import { type TranslationKey, t as translate } from "@/lib/translations";

const POLICY_ROWS: [string, TranslationKey][] = [
  ["shield", "help.policy.approval"],
  ["building", "help.policy.costCenter"],
  ["clock", "help.policy.cancel"],
  ["bolt", "help.policy.quota"],
];

export default async function HelpPage() {
  const locale = await getServerLocale();
  const tr = (key: TranslationKey, params?: Record<string, string | number>) =>
    translate(key, params, locale);
  const faqs = getEnterpriseSupportFaq(locale);

  return (
    <>
      <EntPageHead title={tr("help.title")} sub={tr("help.subtitle")} />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.6fr 1fr",
          gap: 18,
          alignItems: "start",
        }}
      >
        <ECard
          t={t}
          title={tr("help.faq.title")}
          sub={tr("card.sub.faq")}
          pad={0}
        >
          <div>
            {faqs.map((f, i) => (
              <div
                key={i}
                style={{
                  padding: "16px 18px",
                  borderTop: i ? "1px solid " + t.lineSoft : "none",
                }}
              >
                <div
                  style={{ display: "flex", gap: 10, alignItems: "flex-start" }}
                >
                  <EIcon
                    name="info"
                    size={16}
                    style={{ color: t.primary, flexShrink: 0, marginTop: 2 }}
                  />
                  <div>
                    <div
                      style={{ fontSize: 14, fontWeight: 700, marginBottom: 5 }}
                    >
                      {f.q}
                    </div>
                    <div
                      style={{
                        fontSize: 12.5,
                        color: t.muted,
                        lineHeight: 1.65,
                      }}
                    >
                      {f.a}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ECard>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <ECard t={t} title={tr("help.contact.title")}>
            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                <span
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    background: t.primaryBg,
                    color: t.primary,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <EIcon name="phone" size={18} />
                </span>
                <div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      fontFamily: t.mono,
                    }}
                  >
                    {enterpriseTenant.supportPhone}
                  </div>
                  <div style={{ fontSize: 11.5, color: t.muted }}>
                    {tr("help.contact.channelValue")}
                  </div>
                </div>
              </div>
              <EBtn t={t} variant="primary" block icon="phone">
                {tr("help.contact.call")}
              </EBtn>
              <EBtn t={t} variant="default" block icon="brief">
                {tr("help.contact.online")}
              </EBtn>
            </div>
          </ECard>
          <ECard t={t} title={tr("help.policy.title")}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {POLICY_ROWS.map(([icon, key], i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    gap: 9,
                    fontSize: 12.5,
                    color: t.ink2,
                  }}
                >
                  <EIcon
                    name={icon}
                    size={15}
                    style={{ color: t.muted, flexShrink: 0 }}
                  />
                  {tr(key)}
                </div>
              ))}
            </div>
          </ECard>
          <EBanner
            t={t}
            tone="warn"
            icon="alert"
            title={tr("help.banner.title")}
            body={tr("help.banner.body")}
          />
        </div>
      </div>
    </>
  );
}
