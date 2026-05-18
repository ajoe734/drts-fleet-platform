import { renderPartnerStateGate } from "@/lib/render-partner-scenario-page";

type PageProps = {
  params: Promise<{ tenantSlug: string }>;
};

export default async function PartnerInactivePage({ params }: PageProps) {
  return renderPartnerStateGate(params, "inactive");
}
