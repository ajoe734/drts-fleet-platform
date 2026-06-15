import {
  EnterpriseBanner,
  EnterpriseCard,
  EnterpriseDl,
  EnterprisePageHeader,
  EnterpriseSection,
} from "@/components/enterprise-primitives";
import {
  getEnterpriseSupportFaq,
  getEnterpriseTenant,
  getPolicyNotes,
} from "@/lib/enterprise-fixtures";
import { getServerLocale } from "@/lib/server-locale";
import { enterprisePageStyle, enterpriseTheme } from "@/lib/enterprise-theme";
import { t } from "@/lib/translations";

export default async function HelpPage() {
  const locale = await getServerLocale();
  const policyNotes = getPolicyNotes(locale);
  const faq = getEnterpriseSupportFaq(locale);
  const tenant = getEnterpriseTenant(locale);

  return (
    <div style={enterprisePageStyle}>
      <EnterprisePageHeader
        title={t("help.title", undefined, locale)}
        subtitle={t("help.subtitle", undefined, locale)}
      />

      <EnterpriseBanner
        tone="info"
        title={t("help.banner.title", undefined, locale)}
        body={t("help.banner.body", undefined, locale)}
      />

      <EnterpriseSection>
        <EnterpriseCard title={t("help.policy.title", undefined, locale)}>
          <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 8 }}>
            {policyNotes.map((note) => (
              <li key={note} style={{ fontSize: 12.5, color: enterpriseTheme.text }}>
                {note}
              </li>
            ))}
          </ul>
        </EnterpriseCard>

        <EnterpriseCard title={t("help.contact.title", undefined, locale)}>
          <EnterpriseDl
            cols={1}
            items={[
              {
                k: t("help.contact.phone", undefined, locale),
                v: t("common.support24h", { phone: tenant.supportPhone }, locale),
                mono: true,
              },
              {
                k: t("help.contact.email", undefined, locale),
                v: tenant.supportEmail,
                mono: true,
              },
              {
                k: t("help.contact.escalation", undefined, locale),
                v: t("help.contact.escalationValue", undefined, locale),
              },
              {
                k: t("help.contact.channel", undefined, locale),
                v: t("help.contact.channelValue", undefined, locale),
              },
            ]}
          />
        </EnterpriseCard>

        <EnterpriseCard title={t("help.faq.title", undefined, locale)}>
          <div style={{ display: "grid", gap: 12 }}>
            {faq.map((item) => (
              <div key={item.q}>
                <div style={{ fontSize: 12.5, fontWeight: 700 }}>{item.q}</div>
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 12.5,
                    color: enterpriseTheme.textMuted,
                    lineHeight: 1.5,
                  }}
                >
                  {item.a}
                </div>
              </div>
            ))}
          </div>
        </EnterpriseCard>
      </EnterpriseSection>
    </div>
  );
}
