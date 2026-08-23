import { Controller, Get, HttpStatus, Param, Query } from "@nestjs/common";

import { ApiRequestError } from "../../common/api-envelope";
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
 * credential. That is safe here precisely because nothing is served: the route
 * looks nothing up, so there is no existence to disclose.
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
    @Query("expires_at") expiresAt?: string,
    @Query("sig") signature?: string,
  ) {
    if (!signature?.trim()) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "CONTROLLED_DOWNLOAD_SIGNATURE_MISSING",
        "This link is missing its signature and cannot be resolved.",
        { kind, subjectId },
      );
    }

    // Expiry is checked and the signature is not. The signature covers
    // `manifestHash`, which the URL does not carry, so a link cannot be
    // verified from itself -- worth stating plainly rather than implying a
    // check that is not happening. Adding `manifest_hash` to the query would
    // make verification possible and is the prerequisite for serving anything
    // here.
    const expiry = expiresAt ? Date.parse(expiresAt) : Number.NaN;
    if (!Number.isNaN(expiry) && expiry <= Date.now()) {
      throw new ApiRequestError(
        HttpStatus.GONE,
        "CONTROLLED_DOWNLOAD_EXPIRED",
        "This download link has expired. Request the artifact again to get a fresh link.",
        { kind, subjectId, expiresAt },
      );
    }

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
