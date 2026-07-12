import type { CrossAppResourceLink } from "@drts/contracts";
import { CanvasBtn as Btn } from "@drts/ui-web";
import { rocTheme } from "@/lib/roc-theme";
import { crossAppHref } from "@/lib/roc-cross-app-links";
import type { Locale } from "@/lib/translations";
import { t } from "@/lib/translations";

export function RocInvestigationLink({
  link,
  locale,
}: {
  link: CrossAppResourceLink | null;
  locale: Locale;
}) {
  if (!link) {
    return (
      <span style={{ color: rocTheme.textDim, fontSize: 11.5 }}>
        {t("common.none", locale)}
      </span>
    );
  }

  return (
    <a
      href={crossAppHref(link)}
      target={link.openMode === "new_tab" ? "_blank" : undefined}
      rel={link.openMode === "new_tab" ? "noreferrer" : undefined}
      style={{ textDecoration: "none" }}
    >
      <Btn theme={rocTheme} size="xs" variant="ghost" icon="arrow-right">
        {t("common.openInvestigation", locale)}
      </Btn>
    </a>
  );
}
