import {
  CalloutPanel,
  PageHero,
  SurfaceCard,
} from "@/components/page-primitives";

export default function WebhooksPage() {
  return (
    <div className="page-shell">
      <PageHero
        eyebrow="Webhooks"
        title="Webhook operations are exposed as a first-class integration surface."
        description="This route reserves space for endpoint registration, event selection, secret rotation, and delivery visibility while keeping the shell aligned to the authority model in `XS-UI-001`."
      />

      <section className="surface-grid">
        <SurfaceCard
          kicker="Endpoint"
          title="Configuration lane"
          description="Endpoint URL, enabled events, and operational status belong on the primary webhook route rather than under settings miscellany."
        />
        <SurfaceCard
          kicker="Deliveries"
          title="Delivery visibility stays adjacent"
          description="Delivery log access is part of the webhook product surface, not a detached diagnostics module, even if the exact read model still needs backend hardening."
        />
        <SurfaceCard
          kicker="Guardrail"
          title="No fabricated replay semantics"
          description="Only backend-supported retry, test, or rotate-secret commands may appear here. The shell does not invent unsupported delivery actions."
        />
      </section>

      <CalloutPanel
        title="Downstream ownership"
        description="`TEN-UI-006` can deepen this route into a full management surface without revisiting top-level IA. The shell already grants it a stable navigation slot."
      />
    </div>
  );
}
