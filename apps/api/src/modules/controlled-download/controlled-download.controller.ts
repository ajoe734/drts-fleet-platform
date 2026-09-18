import {
  Controller,
  Get,
  HttpStatus,
  Inject,
  Optional,
  Param,
  Query,
  StreamableFile,
} from "@nestjs/common";

import { ApiRequestError } from "../../common/api-envelope";
import { verifyControlledDownloadSignature } from "../../common/controlled-download";
import { OpenRoute } from "../../common/auth";
import {
  DOCUMENT_ARTIFACT_STORE,
  InMemoryDocumentArtifactStore,
  resolveDocumentArtifact,
  type DocumentArtifactStore,
} from "../../common/document-artifacts";

/**
 * Answers the controlled-download links the platform issues.
 *
 * `tenant-invoice`, `placard` and `report` are the families this period's
 * `DocumentArtifactStore` can actually hold bytes for; a caller whose link
 * resolves against a stored artifact gets the file itself. Everything else --
 * the general report route is streamed separately by
 * `GET /reports/:jobId/artifact`; filing packages are metadata by decision
 * (`SD-DP-20260820-012`); regulatory report jobs and accident packets have no
 * renderer at all -- still has nothing behind it, including the three
 * in-scope kinds until whichever task produces them actually calls
 * `store.put(...)`.
 *
 * So a link with nothing materialised behind it fails honestly. Until now the
 * same links pointed at a host that did not resolve, and a caller following
 * one got a DNS error -- indistinguishable from the network being down, and
 * giving no hint that the file was never produced in the first place.
 *
 * The link is not authenticated, because a signed URL is meant to be its own
 * credential -- and as of `AUDIT-ARTIFACT-004` the signature is actually
 * checked, which it never was anywhere before. Until `manifest_hash` was added
 * to the link, it could not be: the signature covers it and the URL omitted it.
 * A verified, unexpired signature is still checked against the *current*
 * stored artifact's hash before any byte is served, so a signature is never
 * on its own treated as authorization to read whatever now lives at that
 * subject id.
 */
@Controller("downloads")
export class ControlledDownloadController {
  constructor(
    @Optional()
    @Inject(DOCUMENT_ARTIFACT_STORE)
    private readonly artifactStore: DocumentArtifactStore = new InMemoryDocumentArtifactStore(),
  ) {}

  // Declared open on purpose. A signed URL is its own credential, and the IAM
  // route inventory requires every route to state its posture rather than
  // acquire one by omission. A verified signature is still not the same
  // thing as authorization to read *whatever currently lives* at this
  // subject id, which is why a resolved artifact is additionally checked
  // against the manifest hash the link itself carries before any byte is
  // returned -- see `resolveDocumentArtifact`.
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

    // The link is genuine and unexpired. Whether there is actually a file
    // behind it -- and whether it is still the same file the link named --
    // is a separate question the store answers.
    const resolution = resolveDocumentArtifact(this.artifactStore, {
      kind,
      subjectId,
      manifestHash: manifestHash!,
    });

    if (resolution.status === "ok") {
      return new StreamableFile(resolution.bytes, {
        type: resolution.mimeType,
      });
    }

    if (resolution.status === "content_mismatch") {
      // The signature and expiry are both genuine, but the file this link
      // named no longer matches what it named at signing time. Treating a
      // valid signature as blanket authorization to serve *whatever is
      // currently stored* at this subject id would let a regenerated or
      // reassigned artifact leak through a stale link; a fresh link is the
      // correct next step, not this one re-served.
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "CONTROLLED_DOWNLOAD_CONTENT_MISMATCH",
        "This link no longer matches the current file. Request a fresh link to get the current version.",
        { kind, subjectId },
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
