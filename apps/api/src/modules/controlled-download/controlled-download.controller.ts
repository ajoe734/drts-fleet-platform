import { Controller, Get, HttpStatus, Param, Query } from "@nestjs/common";

import { ApiRequestError } from "../../common/api-envelope";
import { verifyControlledDownloadSignature } from "../../common/controlled-download";
import { OpenRoute } from "../../common/auth";

/**
 * Answers the controlled-download links the platform issues.
 *
 * No artifact is materialised for any of these kinds. Reports are streamed by
 * `GET /reports/:jobId/artifact`; filing packages are metadata by decision
 * (`SD-DP-20260820-012`); settlement invoices, regulatory report jobs, accident
 * packets and placards have no renderer at all.
 *
 * So this route exists to fail honestly. Until now the same links pointed at a
 * host that did not resolve, and a caller following one got a DNS error --
 * indistinguishable from the network being down, and giving no hint that the
 * file was never produced in the first place.
 *
 * The link is not authenticated, because a signed URL is meant to be its own
 * credential -- and as of `AUDIT-ARTIFACT-004` the signature is actually
 * checked, which it never was anywhere before. Until `manifest_hash` was added
 * to the link, it could not be: the signature covers it and the URL omitted it.
 */
@Controller("downloads")
export class ControlledDownloadController {
  // Declared open on purpose. A signed URL is its own credential, and the IAM
  // route inventory requires every route to state its posture rather than
  // acquire one by omission. Safe here because nothing is served: the handler
  // looks nothing up, so there is no existence to disclose.
  @OpenRoute()
  @Get(":kind/:subjectId")
  resolve(
    @Param("kind") kind: string,
    @Param("subjectId") subjectId: string,
    @Query("signed_at") signedAt?: string,
    @Query("expires_at") expiresAt?: string,
    @Query("key_id") keyId?: string,
    @Query("manifest_hash") manifestHash?: string,
    @Query("sig") signature?: string,
    @Query("sig_v") signatureVersion?: string,
  ) {
    const missing = [
      ["signed_at", signedAt],
      ["expires_at", expiresAt],
      ["key_id", keyId],
      ["manifest_hash", manifestHash],
      ["sig", signature],
      ["sig_v", signatureVersion],
    ]
      .filter(([, value]) => !String(value ?? "").trim())
      .map(([name]) => name);

    if (missing.length > 0) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "CONTROLLED_DOWNLOAD_LINK_INCOMPLETE",
        "This link is missing the fields needed to check it.",
        { kind, subjectId, missing },
      );
    }

    // Signature before expiry, deliberately. Telling a forged link that it is
    // merely "expired" would answer a question it has not earned, and would
    // hand an attacker a way to probe which subject ids and windows exist.
    const verification = verifyControlledDownloadSignature({
      kind,
      subjectId,
      manifestHash: manifestHash!,
      signedAt: signedAt!,
      expiresAt: expiresAt!,
      keyId: keyId!,
      signatureVersion: Number(signatureVersion),
      signature: signature!,
    });
    if (!verification.ok) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "CONTROLLED_DOWNLOAD_SIGNATURE_INVALID",
        "This link could not be verified.",
        { kind, subjectId, reason: verification.reason },
      );
    }

    const expiry = Date.parse(expiresAt!);
    if (!Number.isNaN(expiry) && expiry <= Date.now()) {
      throw new ApiRequestError(
        HttpStatus.GONE,
        "CONTROLLED_DOWNLOAD_EXPIRED",
        "This download link has expired. Request the artifact again to get a fresh link.",
        { kind, subjectId, expiresAt },
      );
    }

    // The link is genuine, unexpired, and there is still nothing behind it.
    // That is now the only remaining reason this route cannot serve a file.
    throw new ApiRequestError(
      HttpStatus.NOT_IMPLEMENTED,
      "ARTIFACT_NOT_MATERIALISED",
      `No file is produced for "${kind}". The API returns this record's contents directly; there is nothing to download.`,
      {
        kind,
        subjectId,
        ...(kind === "report"
          ? { servedInstead: "GET /reports/{jobId}/artifact" }
          : {}),
      },
    );
  }
}
