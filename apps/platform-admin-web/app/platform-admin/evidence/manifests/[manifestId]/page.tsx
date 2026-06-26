import { SandboxDesignPendingScreen } from "@/components/sandbox-design-pending-screen";

export default function EvidenceManifestPage() {
  return (
    <SandboxDesignPendingScreen
      title="Evidence Manifest Detail"
      purpose="This route needs a canonical chain-of-custody detail screen for one evidence manifest and its linked case context."
      route="/platform-admin/evidence/manifests/[manifestId]"
    />
  );
}
