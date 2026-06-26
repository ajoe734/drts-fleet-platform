import { SandboxDesignPendingScreen } from "@/components/sandbox-design-pending-screen";

export default function EvidenceManifestPage() {
  return (
    <SandboxDesignPendingScreen
      titleKey="assistant.route.sandboxEvidenceManifest.title"
      purposeKey="sandbox.pending.evidenceManifest.purpose"
      route="/platform-admin/evidence/manifests/[manifestId]"
    />
  );
}
