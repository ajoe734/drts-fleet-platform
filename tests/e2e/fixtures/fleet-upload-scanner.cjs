/* eslint-disable @typescript-eslint/no-require-imports -- Node --require preloads must run synchronously before the compiled CommonJS API bootstrap. */
// Hosted hermetic E2E-019 only. This replaces the external scanner HTTP
// boundary, not upload/storage/scan-correlation/authorization logic. It is
// never imported by production and is NOT genuine ClamAV acceptance evidence.
if (
  process.env.CI !== "true" ||
  process.env.AUTH_MODE !== "test" ||
  process.env.DOCUMENT_ARTIFACT_STORAGE_PROVIDER !== "memory" ||
  [process.env.NODE_ENV, process.env.APP_ENV, process.env.DRTS_ENV].some(
    (value) => ["prod", "production", "stage", "staging"].includes(value),
  )
) {
  throw new Error(
    "Fleet scanner fixture requires the hosted hermetic test environment.",
  );
}
const { createHash } = require("node:crypto");
const { resolve } = require("node:path");
const { createRequire } = require("node:module");
const apiRequire = createRequire(
  resolve(__dirname, "../../../apps/api/package.json"),
);
apiRequire("reflect-metadata");
const compiled = resolve(__dirname, "../../../apps/api/dist/modules");
const { FleetPartnerModule } = require(
  `${compiled}/fleet-partner/fleet-partner.module.js`,
);
const { FLEET_DOCUMENT_SCANNER_FACTORY } = require(
  `${compiled}/fleet-partner/fleet-document-storage.service.js`,
);
const { CloudRunRemittanceProofScannerAdapter } = require(
  `${compiled}/billing-settlement/cloud-run-remittance-proof-scanner.adapter.js`,
);
Reflect.getMetadata("providers", FleetPartnerModule).push({
  provide: FLEET_DOCUMENT_SCANNER_FACTORY,
  useValue: (storage) =>
    new CloudRunRemittanceProofScannerAdapter(
      storage,
      "https://hermetic-scanner.run.app",
      1000,
      {
        identityToken: async () => "hermetic-only",
        accessToken: async () => "hermetic-only",
      },
      async (_url, init) => {
        const bytes = Buffer.from(init.body);
        return Response.json({
          sha256: createHash("sha256").update(bytes).digest("hex"),
          sizeBytes: bytes.length,
          verdict: bytes.includes(
            Buffer.from("EICAR-STANDARD-ANTIVIRUS-TEST-FILE"),
          )
            ? "infected"
            : "clean",
        });
      },
    ),
});
console.log(
  "[hermetic] C125 external scanner HTTP is simulated; storage, correlation and auth remain production code.",
);
