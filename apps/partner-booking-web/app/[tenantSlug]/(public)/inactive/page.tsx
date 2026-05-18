import { renderPartnerStateGate } from "@/lib/render-state-gate";

type PageProps = {
  params: Promise<{ tenantSlug: string }>;
};

export default async function PartnerInactivePage({ params }: PageProps) {
  return renderPartnerStateGate(params, "inactive");
}
