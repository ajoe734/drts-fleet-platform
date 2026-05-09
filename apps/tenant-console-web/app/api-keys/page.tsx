import {
  CalloutPanel,
  PageHero,
  SurfaceCard,
} from "@/components/page-primitives";

export default function ApiKeysPage() {
  return (
    <div className="page-shell">
      <PageHero
        eyebrow="API keys"
        title="Integration credentials move into the primary shell."
        description="The information architecture makes API key lifecycle visible at the top level so tenant integration managers can issue, rotate, and revoke credentials without hunting through miscellaneous tools."
      />

      <section className="surface-grid">
        <SurfaceCard
          kicker="Lifecycle"
          title="Issue, rotate, revoke"
          description="The shell is anchored to the existing tenant key commands and leaves detailed expiry, scope, and last-used presentation for `TEN-UI-006`."
        />
        <SurfaceCard
          kicker="Boundary"
          title="No client-side credential truth"
          description="Key material remains backend-owned and one-time visible only. The route exists to expose the governance surface, not to normalize local persistence."
        />
      </section>

      <CalloutPanel
        title="Shared integration band"
        description="API keys and webhooks intentionally sit next to each other in navigation because both are tenant-managed integrations, but they keep distinct lifecycle language and authority rules."
      />
    </div>
  );
}
