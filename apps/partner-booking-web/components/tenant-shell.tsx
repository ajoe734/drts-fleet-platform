import type { ReactNode } from "react";
import { getPartnerChromeVars, type PartnerBrand } from "@/lib/brand";

type TenantShellProps = {
  brand: PartnerBrand;
  children: ReactNode;
};

export function TenantShell({ brand, children }: TenantShellProps) {
  return (
    <div className="pb-shell" style={getPartnerChromeVars(brand)}>
      <div className="pb-shell__window">
        <div className="pb-shell__chrome">
          <div className="pb-shell__lights" aria-hidden="true">
            <span className="pb-shell__light pb-shell__light--stop" />
            <span className="pb-shell__light pb-shell__light--pause" />
            <span className="pb-shell__light pb-shell__light--go" />
          </div>
          <div className="pb-shell__host">
            <span aria-hidden="true">●</span>
            <span className="pb-shell__host-text">{brand.host}</span>
          </div>
          <div className="pb-shell__secure">partner entry</div>
        </div>

        <header className="pb-shell__identity">
          <div className="pb-shell__identity-main">
            <div
              className="pb-shell__badge"
              style={{
                background: `linear-gradient(135deg, ${brand.cardArt.gradientFrom} 0%, ${brand.cardArt.gradientTo} 100%)`,
              }}
            >
              {brand.cardArt.badgeText}
            </div>
            <div className="pb-shell__copy">
              <span className="pb-shell__eyebrow">Partner Booking</span>
              <div className="pb-shell__title">
                {brand.bankName} × DRTS
                <br />
                {brand.programName}
              </div>
              <p className="pb-shell__subtitle">{brand.tagline}</p>
            </div>
          </div>

          <div className="pb-shell__chips">
            <span className="pb-shell__chip pb-shell__chip--accent">
              {brand.displayName}
            </span>
            <span className="pb-shell__chip">{brand.hotline.phone}</span>
            <span className="pb-shell__chip">
              {brand.cardArt.networkLabel} •••• {brand.cardArt.lastFour}
            </span>
          </div>
        </header>

        <main className="pb-shell__content">
          <div className="pb-shell__phone">{children}</div>
        </main>
      </div>
    </div>
  );
}
