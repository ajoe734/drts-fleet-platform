import { Injectable } from "@nestjs/common";

import type {
  RemittanceProofScanInput,
  RemittanceProofScanOutcome,
  RemittanceProofScannerAvailability,
  RemittanceProofScannerPort,
} from "./remittance-proof-scanner.port";

/**
 * The fail-closed default: no malware-scanning provider is configured for
 * this deployment. `availability()` reports that honestly instead of
 * silently defaulting to "clean" -- mirrors
 * `UnavailablePaymentRecoveryPort` in `./payment-recovery.port.ts`, the
 * sibling fail-closed adapter already established in this module.
 *
 * With this adapter wired, an uploaded proof simply stays `pending_scan`
 * forever (never gets fabricated to `clean`), which is why `markPaid`
 * correctly stays blocked -- see
 * `docs/04-uat/system-remediation-20260906/SR-PROOF-001.md` for the
 * explicit external-gate boundary this records.
 */
@Injectable()
export class UnprovisionedRemittanceProofScannerAdapter
  implements RemittanceProofScannerPort
{
  readonly providerName = "unprovisioned";

  availability(): RemittanceProofScannerAvailability {
    return {
      state: "unavailable",
      reason: "No remittance-proof malware-scanning provider is configured.",
    };
  }

  async scan(): Promise<RemittanceProofScanOutcome> {
    throw new Error(
      "Remittance proof scanner adapter is not provisioned. " +
        "Configure REMITTANCE_PROOF_SCANNER_PROVIDER to enable scanning.",
    );
  }
}

/** The literal signature the EICAR antivirus test file defines. */
const EICAR_TEST_SIGNATURE =
  "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

/**
 * A real, narrowly-scoped scanner: it detects the industry-standard EICAR
 * antivirus test signature and nothing else. This is not a full malware
 * engine, and it does not pretend to be one -- it is an honest, opt-in
 * local/dev/test adapter that lets the `clean` path be exercised without
 * fabricating a scan result. It is never wired by default; a deployment
 * must explicitly configure `REMITTANCE_PROOF_SCANNER_PROVIDER=eicar-signature`
 * to use it, and doing so in production would be a deliberate,
 * documented choice to run a signature check narrower than a real AV
 * engine, not a claim that one is provisioned.
 */
@Injectable()
export class EicarSignatureRemittanceProofScannerAdapter
  implements RemittanceProofScannerPort
{
  readonly providerName = "eicar-signature";

  constructor(private readonly inspect: (proofId: string) => Buffer | null) {}

  availability(): RemittanceProofScannerAvailability {
    return { state: "available" };
  }

  async scan(
    input: RemittanceProofScanInput,
  ): Promise<RemittanceProofScanOutcome> {
    const bytes = this.inspect(input.proofId);
    const scanCompletedAt = new Date().toISOString();
    if (!bytes) {
      return {
        scanState: "rejected",
        rejectionReason:
          "Stored content could not be re-read for scanning at scan time.",
        scanCompletedAt,
      };
    }
    const matched = bytes.includes(Buffer.from(EICAR_TEST_SIGNATURE, "ascii"));
    if (matched) {
      return {
        scanState: "rejected",
        rejectionReason: "EICAR_TEST_SIGNATURE_DETECTED",
        scanCompletedAt,
      };
    }
    return { scanState: "clean", rejectionReason: null, scanCompletedAt };
  }
}
