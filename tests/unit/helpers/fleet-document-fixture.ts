import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { InMemoryDocumentArtifactStore } from "../../../apps/api/src/common/document-artifacts";
import { CloudRunRemittanceProofScannerAdapter } from "../../../apps/api/src/modules/billing-settlement/cloud-run-remittance-proof-scanner.adapter";
import { FleetDocumentStorageService } from "../../../apps/api/src/modules/fleet-partner/fleet-document-storage.service";
import type { BootstrapRequestIdentity } from "../../../apps/api/src/common/auth/auth.types";

export const fleetIdentity: BootstrapRequestIdentity = {
  authMode: "partner_api_key",
  actorType: "partner_api_key",
  actorId: "owner",
  realm: "partner",
  partnerId: "fleet-demo-001",
  tenantId: null,
  roleFamilies: ["partner"],
  roles: ["partner"],
  scopes: ["billing:read"],
  requestId: null,
};
export const pdfBytes = Buffer.alloc(1024, "test pdf ");
export const pdfChecksum = createHash("sha256").update(pdfBytes).digest("hex");
export const byteStream = (bytes: Buffer) => Readable.from([bytes]);

// Only the cloud identity and HTTP scanner boundary are simulated. The real
// scanner adapter still re-reads storage, hashes bytes and correlates verdicts.
export function fleetStorageFixture(
  mode: "clean" | "infected" | "offline" | "mismatch" = "clean",
  store = new InMemoryDocumentArtifactStore(),
) {
  const storage = new FleetDocumentStorageService(
    store,
    (reader) =>
      new CloudRunRemittanceProofScannerAdapter(
        reader,
        "https://fleet-scanner.run.app",
        1000,
        {
          accessToken: async () => "test-token",
          identityToken: async () => "test-token",
        },
        async (_url, init) => {
          if (mode === "offline") throw new Error("test scanner unavailable");
          const bytes = Buffer.from(init?.body as Uint8Array);
          return Response.json({
            verdict: mode === "infected" ? "infected" : "clean",
            sizeBytes: bytes.length,
            sha256:
              mode === "mismatch"
                ? "0".repeat(64)
                : createHash("sha256").update(bytes).digest("hex"),
          });
        },
      ),
  );
  return { storage, store };
}
