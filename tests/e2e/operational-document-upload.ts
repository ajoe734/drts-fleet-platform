import {
  expect,
  type APIRequestContext,
  type APIResponse,
  type Page,
} from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { normalizeApiResponse } from "./system-remediation/sr-live-map-001/wire-response";

function expectCandidateRevision(
  headers: Headers | Record<string, string>,
  label: string,
) {
  const candidateSha = process.env.DRTS_CANDIDATE_SHA?.trim();
  if (candidateSha) {
    const headerValue =
      "get" in headers && typeof headers.get === "function"
        ? headers.get("x-drts-candidate-sha")
        : (headers as Record<string, string>)["x-drts-candidate-sha"];
    expect(
      headerValue,
      `${label} must report the deployed immutable candidate SHA`,
    ).toBe(candidateSha);
  }
}

export const OPERATIONAL_PDF_BYTES = Buffer.from(
  "%PDF-1.4\n" +
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n" +
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n" +
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 72 72] >>\nendobj\n" +
    "xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n" +
    "trailer\n<< /Size 4 /Root 1 0 R >>\n" +
    "startxref\n184\n%%EOF\n",
);

export const OPERATIONAL_PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==",
  "base64",
);

export const OPERATIONAL_JPEG_BYTES = Buffer.from(
  "ffd8ffe000104a46494600010100000100010000ffdb0043000101010101010101" +
    "010101010101010101010101010101010101010101010101010101010101010101" +
    "0101010101010101010101010101010101010101010101ffc0000b080001000101" +
    "011100ffc4001f0000010501010101010100000000000000000102030405060708" +
    "090a0bffc400b5100002010303020403050504040000017d010203000411051221" +
    "31410613516107227114328191a1082342b1c11552d1f02433627282090a161718" +
    "191a25262728292a3435363738393a434445464748494a535455565758595a6364" +
    "65666768696a737475767778797a838485868788898a92939495969798999aa2a3" +
    "a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9" +
    "dadbc2ffda0008010100003f007f00ffd9",
  "hex",
);

export type OperationalDocumentMimeType =
  | "application/pdf"
  | "image/png"
  | "image/jpeg";

export const ALLOWED_SUPPLY_DOCUMENT_TYPES = [
  "professional_driver_license",
  "taxi_driver_registration",
  "vehicle_registration",
  "insurance_policy",
  "fleet_participation_contract",
  "driver_management_contract",
  "vehicle_management_contract",
  "other",
] as const;

export const DRIVER_SUPPLY_DOCUMENT_TYPES = [
  "professional_driver_license",
  "taxi_driver_registration",
  "fleet_participation_contract",
  "driver_management_contract",
  "other",
] as const;

export const VEHICLE_SUPPLY_DOCUMENT_TYPES = [
  "vehicle_registration",
  "insurance_policy",
  "fleet_participation_contract",
  "vehicle_management_contract",
  "other",
] as const;

export function getOperationalDocumentFixture(
  contentTypeInput?: unknown,
  fileNameInput?: unknown,
): {
  bytes: Buffer<ArrayBuffer>;
  sha256: string;
  fileSize: number;
  contentType: OperationalDocumentMimeType;
  originalFileName: string;
} {
  const requestedType =
    typeof contentTypeInput === "string" && contentTypeInput.trim()
      ? contentTypeInput.trim().toLowerCase()
      : "application/pdf";
  let bytes: Buffer<ArrayBuffer>;
  let contentType: OperationalDocumentMimeType;
  let defaultFileName: string;
  if (requestedType === "application/pdf") {
    bytes = OPERATIONAL_PDF_BYTES;
    contentType = "application/pdf";
    defaultFileName = "harmless-upload.pdf";
  } else if (requestedType === "image/png") {
    bytes = OPERATIONAL_PNG_BYTES;
    contentType = "image/png";
    defaultFileName = "harmless-upload.png";
  } else if (requestedType === "image/jpeg") {
    bytes = OPERATIONAL_JPEG_BYTES;
    contentType = "image/jpeg";
    defaultFileName = "harmless-upload.jpg";
  } else {
    throw new Error(
      `Unsupported operational document contentType: ${String(contentTypeInput)}`,
    );
  }
  const originalFileName =
    typeof fileNameInput === "string" && fileNameInput.trim()
      ? fileNameInput.trim()
      : defaultFileName;
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return {
    bytes,
    sha256,
    fileSize: bytes.length,
    contentType,
    originalFileName,
  };
}

export type LifecycleEvidence = {
  objectKey: string;
  sha256: string;
  fileSize: number;
  intentAttempts: number;
  putAttempts: number;
  confirmAttempts: number;
  downloadAttempts: number;
  documentId?: string;
  attachmentId?: string;
  intentStatus: number;
  putStatus: number;
  putScanState: string;
  confirmStatus: number;
  confirmSubmissionId?: string;
  confirmCaseId?: string;
  confirmFleetPartnerId?: string;
  confirmDocumentType?: string;
  confirmAttachmentState?: string;
  canonicalReadbackStatus?: number;
  readUrlStatus?: number;
  signedDownloadUrl?: string;
  downloadStatus: number;
  readbackSha256: string;
  readbackFileSize: number;
  readbackContentType: string;
  reviewerDownloadStatus?: number;
  reviewerReadbackSha256?: string;
  reviewerReadbackFileSize?: number;
  reviewerReadbackContentType?: string;
  transientHistory: string[];
};

export async function uploadOperationalDocument(
  request: APIRequestContext,
  origin: string,
  intentPath: string,
  intentBody: Record<string, unknown>,
  confirmPath: string,
  confirmBody: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<LifecycleEvidence> {
  const lifecycleHeaders = new Headers(headers);
  const {
    bytes: fixtureBytes,
    sha256,
    fileSize,
    contentType,
    originalFileName,
  } = getOperationalDocumentFixture(
    intentBody.contentType ?? confirmBody.contentType,
    intentBody.originalFileName ??
      intentBody.fileName ??
      confirmBody.originalFileName ??
      confirmBody.fileName,
  );

  const totalBudget = 60000;
  const startTime = Date.now();
  function getRemainingTime(): number {
    return Math.max(1, totalBudget - (Date.now() - startTime));
  }
  function checkDeadline() {
    if (Date.now() - startTime > totalBudget) {
      throw new Error(
        "Operational document upload lifecycle exceeded time budget",
      );
    }
  }

  // Bounded Fetch implementation
  async function boundedFetch(
    url: string,
    options: RequestInit,
  ): Promise<{ status: number; headers: Headers; body: Buffer }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(new Error("Timeout")),
      getRemainingTime(),
    );
    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
        redirect: "manual",
      });
      const chunks: Uint8Array[] = [];
      let received = 0;
      if (res.body) {
        const reader = res.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            received += value.length;
            if (received > 1024 * 1024) {
              reader.cancel();
              throw new Error("Response exceeded bounded limit of 1MB");
            }
            chunks.push(value);
          }
        }
      }
      return {
        status: res.status,
        headers: res.headers,
        body: Buffer.concat(chunks),
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // 1. Intent Validation (R3)
  const parsedIntentUrl = new URL(intentPath, origin);
  expect(parsedIntentUrl.origin, "intent URL must be same origin").toBe(
    new URL(origin).origin,
  );
  expect(
    parsedIntentUrl.username,
    "intent URL must not contain credentials",
  ).toBe("");
  expect(
    parsedIntentUrl.password,
    "intent URL must not contain credentials",
  ).toBe("");
  expect(
    Array.from(parsedIntentUrl.searchParams.keys()).length,
    "intent URL must not contain extra queries",
  ).toBe(0);
  expect(parsedIntentUrl.hash, "intent URL must not contain fragment").toBe("");

  if (parsedIntentUrl.pathname.startsWith("/api/")) {
    parsedIntentUrl.pathname = parsedIntentUrl.pathname.replace(
      /^\/api\//,
      "/control-plane-proxy/",
    );
  }
  const intentPathname = parsedIntentUrl.pathname;
  const supplyParentPrefixMatch = intentPathname.match(
    /^(\/control-plane-proxy\/fleet-partner\/supply-submissions\/([^/]+))\/documents\/(?:intent|upload-url)$/,
  );
  const caseParentPrefixMatch = intentPathname.match(
    /^(\/control-plane-proxy\/fleet-partner\/cases\/([^/]+))\/attachments\/(?:intent|upload-url)$/,
  );
  const parentPrefixMatch = supplyParentPrefixMatch ?? caseParentPrefixMatch;
  expect(
    parentPrefixMatch,
    "intentPath must match exact parent prefix shape (/control-plane-proxy/fleet-partner/supply-submissions/... or /control-plane-proxy/fleet-partner/cases/...).",
  ).toBeTruthy();

  const parsedConfirmUrl = new URL(confirmPath, origin);
  expect(parsedConfirmUrl.origin, "confirm URL must be same origin").toBe(
    new URL(origin).origin,
  );
  expect(
    parsedConfirmUrl.username,
    "confirm URL must not contain credentials",
  ).toBe("");
  expect(
    parsedConfirmUrl.password,
    "confirm URL must not contain credentials",
  ).toBe("");
  expect(
    Array.from(parsedConfirmUrl.searchParams.keys()).length,
    "confirm URL must not contain extra queries",
  ).toBe(0);
  expect(parsedConfirmUrl.hash, "confirm URL must not contain fragment").toBe(
    "",
  );

  if (parsedConfirmUrl.pathname.startsWith("/api/")) {
    parsedConfirmUrl.pathname = parsedConfirmUrl.pathname.replace(
      /^\/api\//,
      "/control-plane-proxy/",
    );
  }
  const confirmPathname = parsedConfirmUrl.pathname;

  if (caseParentPrefixMatch) {
    const parentPrefix = caseParentPrefixMatch[1] as string;
    const expectedCaseId = decodeURIComponent(
      caseParentPrefixMatch[2] as string,
    );
    expect(
      confirmPathname,
      "confirm URL pathname must match parent scope",
    ).toBe(`${parentPrefix}/attachments/confirm`);

    // Hop 1: Authoritative Case readback
    const readbackResponse = await boundedFetch(
      new URL(parentPrefix, origin).toString(),
      {
        method: "GET",
        headers: lifecycleHeaders,
      },
    );
    checkDeadline();
    expect(readbackResponse.status, `readback case ${parentPrefix}`).toBe(200);
    expectCandidateRevision(
      readbackResponse.headers,
      `readback case ${parentPrefix}`,
    );
    const readbackData = JSON.parse(
      readbackResponse.body.toString("utf8"),
    ) as any;
    const caseDetail =
      readbackData?.data?.case_detail ??
      readbackData?.data?.caseDetail ??
      readbackData?.data;
    const authoritativeFleetId =
      caseDetail?.fleet_partner_id ||
      caseDetail?.fleetPartnerId ||
      readbackData?.data?.fleet_partner_id ||
      readbackData?.data?.fleetPartnerId;
    const authoritativeCaseId =
      caseDetail?.id || caseDetail?.case_id || caseDetail?.caseId;
    const caseStatus = caseDetail?.status;
    const caseResponsibility = caseDetail?.responsibility;
    expect(authoritativeFleetId, "authoritative case fleet").toBeTruthy();
    expect(
      authoritativeCaseId,
      "authoritative case ID must match intent URL",
    ).toBe(expectedCaseId);
    if (caseStatus === "closed") {
      throw new Error(`case ${expectedCaseId} must be editable (not closed)`);
    }
    if (caseResponsibility === "platform") {
      throw new Error(
        `case ${expectedCaseId} must be fleet-editable (not platform-only responsibility)`,
      );
    }
    if (
      typeof intentBody.expectedFleetPartnerId === "string" &&
      intentBody.expectedFleetPartnerId.trim() &&
      authoritativeFleetId !== intentBody.expectedFleetPartnerId.trim()
    ) {
      throw new Error(
        `authoritative case fleet_partner_id (${authoritativeFleetId}) must match expectedFleetPartnerId (${intentBody.expectedFleetPartnerId.trim()})`,
      );
    }

    const cleanCaseIntentBody = Object.fromEntries(
      Object.entries(intentBody).filter(
        ([key]) =>
          ![
            "contentType",
            "originalFileName",
            "fileName",
            "fileSize",
            "expectedFleetPartnerId",
          ].includes(key),
      ),
    );

    // Hop 2: Case attachment intent execution
    const intentResponse = await boundedFetch(parsedIntentUrl.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({
        ...cleanCaseIntentBody,
        fileName: originalFileName,
        fileSize,
        contentType,
      }),
    });
    checkDeadline();
    expect(
      [200, 201].includes(intentResponse.status),
      `intent request to ${intentPath} must be 200 or 201, got ${intentResponse.status}`,
    ).toBeTruthy();
    expectCandidateRevision(
      intentResponse.headers,
      `intent request to ${intentPath}`,
    );

    const intentData = JSON.parse(intentResponse.body.toString("utf8")) as {
      data: {
        attachment_id?: string;
        attachmentId?: string;
        case_id?: string;
        caseId?: string;
        fleet_partner_id?: string;
        fleetPartnerId?: string;
        object_key?: string;
        objectKey?: string;
        upload_url?: string;
        uploadUrl?: string;
        method?: string;
        headers?: Record<string, string>;
      };
    };

    const attachmentId =
      intentData?.data?.attachment_id || intentData?.data?.attachmentId;
    const objectKey =
      intentData?.data?.object_key || intentData?.data?.objectKey || "";
    const rawUploadUrl =
      intentData?.data?.upload_url || intentData?.data?.uploadUrl || "";
    const uploadMethod = intentData?.data?.method;
    const uploadHeaders = intentData?.data?.headers || {};
    const intentCaseId = intentData?.data?.case_id || intentData?.data?.caseId;
    const intentFleetId =
      intentData?.data?.fleet_partner_id || intentData?.data?.fleetPartnerId;

    expect(attachmentId, "attachment_id from case intent").toBeTruthy();
    expect(
      attachmentId,
      "attachment_id must be a strict single segment",
    ).toMatch(/^[-a-zA-Z0-9_]+$/);
    expect(objectKey, "object_key from case intent").toBeTruthy();
    expect(
      objectKey.startsWith(
        `fleet-partner/${authoritativeFleetId}/cases/${expectedCaseId}/${attachmentId}-`,
      ),
      "case object_key must begin with exact authoritative fleet/case/attachment prefix",
    ).toBeTruthy();
    if (intentCaseId) {
      expect(intentCaseId, "intent case_id must match").toBe(expectedCaseId);
    }
    if (intentFleetId) {
      expect(
        intentFleetId,
        "intent fleet_partner_id must match authoritative case fleet",
      ).toBe(authoritativeFleetId);
    }
    expect(rawUploadUrl, "upload_url from case intent").toBeTruthy();
    expect(uploadMethod, "upload method must be exactly provided").toBe("PUT");
    expect(
      uploadHeaders["Content-Type"] || uploadHeaders["content-type"],
      "must contain application/octet-stream",
    ).toBe("application/octet-stream");

    const parsedUploadUrl = new URL(rawUploadUrl, origin);
    expect(parsedUploadUrl.origin, "upload URL must be same origin").toBe(
      new URL(origin).origin,
    );
    expect(
      parsedUploadUrl.username,
      "upload URL must not contain credentials",
    ).toBe("");
    expect(
      parsedUploadUrl.password,
      "upload URL must not contain credentials",
    ).toBe("");
    if (parsedUploadUrl.pathname.startsWith("/api/")) {
      parsedUploadUrl.pathname = parsedUploadUrl.pathname.replace(
        /^\/api\//,
        "/control-plane-proxy/",
      );
    }
    expect(
      parsedUploadUrl.pathname,
      "upload URL pathname must match case parent scope",
    ).toBe(`${parentPrefix}/attachments/content`);
    expect(
      parsedUploadUrl.searchParams.get("objectKey") ||
        parsedUploadUrl.searchParams.get("object_key"),
      "upload URL must bind objectKey",
    ).toBe(objectKey);
    expect(
      Array.from(parsedUploadUrl.searchParams.keys()).length,
      "upload URL must not contain extra queries",
    ).toBe(1);
    expect(parsedUploadUrl.hash, "upload URL must not contain fragment").toBe(
      "",
    );

    const uploadUrl = parsedUploadUrl.toString();
    const putHeaders = new Headers(uploadHeaders);
    lifecycleHeaders.forEach((value, name) => {
      if (name !== "content-type") putHeaders.set(name, value);
    });

    // Hop 3: PUT exact bytes and scan
    let scanReceiptOk = false;
    let putAttempts = 0;
    let putStatus = 0;
    let putScanState = "";
    const transientHistory: string[] = [];
    const maxAttempts = 45;

    while (
      !scanReceiptOk &&
      putAttempts < maxAttempts &&
      getRemainingTime() > 0
    ) {
      putAttempts++;
      const putResponse = await boundedFetch(uploadUrl, {
        method: "PUT",
        headers: putHeaders,
        body: fixtureBytes,
      });
      checkDeadline();

      putStatus = putResponse.status;
      if (putResponse.status === 503) {
        const errText = putResponse.body.toString("utf8");
        const errBody = JSON.parse(errText || "{}");
        checkDeadline();
        expectCandidateRevision(
          putResponse.headers,
          `PUT exact bytes transient error to ${uploadUrl}`,
        );
        transientHistory.push(errBody?.error?.code || "unknown_503");
        if (errBody?.error?.code === "DOCUMENT_SCANNER_UNAVAILABLE") {
          await new Promise((resolve) =>
            setTimeout(resolve, Math.min(1000, getRemainingTime())),
          );
          checkDeadline();
          continue;
        }
      }

      expect(
        [200, 201].includes(putResponse.status),
        `PUT exact bytes to ${uploadUrl} must be 200 or 201, got ${putResponse.status}`,
      ).toBeTruthy();
      expectCandidateRevision(
        putResponse.headers,
        `PUT exact bytes to ${uploadUrl}`,
      );

      const putData = JSON.parse(putResponse.body.toString("utf8")) as {
        data?: {
          attachment_id?: string;
          attachmentId?: string;
          case_id?: string;
          caseId?: string;
          checksum_sha256?: string;
          file_size?: number;
          scan_state?: string;
        };
      };
      checkDeadline();
      if (putData?.data?.attachment_id || putData?.data?.attachmentId) {
        expect(
          putData?.data?.attachment_id || putData?.data?.attachmentId,
          "PUT attachment_id must match intent attachmentId",
        ).toBe(attachmentId);
      }
      expect(putData?.data?.checksum_sha256, "PUT checksum").toBe(sha256);
      expect(putData?.data?.file_size, "PUT file_size").toBe(fileSize);
      expect(putData?.data?.scan_state, "PUT scan_state").toBe("clean");
      putScanState = putData?.data?.scan_state || "";
      scanReceiptOk = true;
    }
    expect(
      scanReceiptOk,
      "Scanner must eventually process the bytes and return clean receipt within deadline",
    ).toBeTruthy();

    // Hop 4: Confirm case attachment
    const cleanCaseConfirmBody = Object.fromEntries(
      Object.entries(confirmBody).filter(
        ([key]) =>
          !["contentType", "originalFileName", "fileName", "fileSize"].includes(
            key,
          ),
      ),
    );
    const finalConfirmBody = {
      ...cleanCaseConfirmBody,
      attachmentId,
      objectKey,
      fileName: originalFileName,
      fileSize,
      contentType,
      checksumSha256: sha256,
    };

    const confirmResponse = await boundedFetch(parsedConfirmUrl.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(finalConfirmBody),
    });
    checkDeadline();
    expect(
      [200, 201].includes(confirmResponse.status),
      `confirm request to ${confirmPath} must be 200 or 201, got ${confirmResponse.status}`,
    ).toBeTruthy();
    expectCandidateRevision(
      confirmResponse.headers,
      `confirm request to ${confirmPath}`,
    );

    const confirmData = JSON.parse(confirmResponse.body.toString("utf8")) as {
      data?: {
        attachment_id?: string;
        attachmentId?: string;
        case_id?: string;
        caseId?: string;
        fleet_partner_id?: string;
        fleetPartnerId?: string;
        object_key?: string;
        objectKey?: string;
        file_size?: number;
        fileSize?: number;
        content_type?: string;
        contentType?: string;
        name?: string;
        state?: string;
      };
    };
    checkDeadline();

    const confirmAttachmentId =
      confirmData?.data?.attachment_id || confirmData?.data?.attachmentId;
    const confirmCaseId =
      confirmData?.data?.case_id || confirmData?.data?.caseId;
    const confirmFleetId =
      confirmData?.data?.fleet_partner_id || confirmData?.data?.fleetPartnerId;
    const confirmObjKey =
      confirmData?.data?.object_key || confirmData?.data?.objectKey;
    const confirmSize =
      confirmData?.data?.file_size ?? confirmData?.data?.fileSize;
    const confirmType =
      confirmData?.data?.content_type || confirmData?.data?.contentType;
    const confirmName = confirmData?.data?.name;
    const confirmState = confirmData?.data?.state;

    expect(
      confirmAttachmentId,
      "confirm attachment_id must match intent attachmentId",
    ).toBe(attachmentId);
    expect(confirmCaseId, "confirm case_id must match URL").toBe(
      expectedCaseId,
    );
    expect(
      confirmFleetId,
      "confirm fleet_partner_id must match authoritative case readback",
    ).toBe(authoritativeFleetId);
    expect(confirmObjKey, "confirm object_key metadata").toBe(objectKey);
    expect(confirmSize, "confirm size metadata").toBe(fileSize);
    expect(confirmType, "confirm mime metadata").toBe(contentType);
    expect(confirmName, "confirm file name metadata").toBe(originalFileName);
    expect(confirmState, "confirm attachment state must be done").toBe("done");

    // Hop 5: Canonical Case readback verifying persisted attachment metadata
    const canonicalCaseResponse = await boundedFetch(
      new URL(parentPrefix, origin).toString(),
      {
        method: "GET",
        headers: lifecycleHeaders,
      },
    );
    checkDeadline();
    expect(
      canonicalCaseResponse.status,
      `canonical case readback ${parentPrefix}`,
    ).toBe(200);
    expectCandidateRevision(
      canonicalCaseResponse.headers,
      `canonical case readback ${parentPrefix}`,
    );
    const canonicalCaseData = JSON.parse(
      canonicalCaseResponse.body.toString("utf8"),
    ) as any;
    const canonicalCaseDetail =
      canonicalCaseData?.data?.case_detail ??
      canonicalCaseData?.data?.caseDetail ??
      canonicalCaseData?.data;
    const canonicalAttachments = Array.isArray(canonicalCaseDetail?.attachments)
      ? (canonicalCaseDetail.attachments as Array<Record<string, unknown>>)
      : [];
    const matchedAttachment = canonicalAttachments.find(
      (item) =>
        (item.attachment_id || item.attachmentId || item.id) === attachmentId,
    );
    expect(
      matchedAttachment,
      `canonical case ${expectedCaseId} attachments must include confirmed ${attachmentId}`,
    ).toBeTruthy();
    expect(
      matchedAttachment?.state,
      "canonical case attachment state must be done",
    ).toBe("done");
    expect(
      matchedAttachment?.object_key || matchedAttachment?.objectKey,
      "canonical case attachment object_key must match",
    ).toBe(objectKey);
    expect(
      matchedAttachment?.file_size ?? matchedAttachment?.fileSize,
      "canonical case attachment file_size must match",
    ).toBe(fileSize);
    expect(
      matchedAttachment?.content_type || matchedAttachment?.contentType,
      "canonical case attachment content_type must match",
    ).toBe(contentType);

    // Hop 6: Request signed read-url
    const readUrlPath = `${parentPrefix}/attachments/${encodeURIComponent(attachmentId!)}/read-url`;
    const parsedReadUrl = new URL(readUrlPath, origin);
    const readUrlResponse = await boundedFetch(parsedReadUrl.toString(), {
      method: "GET",
      headers: lifecycleHeaders,
    });
    checkDeadline();
    expect(
      readUrlResponse.status,
      `GET case attachment read-url from ${parsedReadUrl.toString()}`,
    ).toBe(200);
    expectCandidateRevision(
      readUrlResponse.headers,
      `GET case attachment read-url from ${parsedReadUrl.toString()}`,
    );
    const readUrlData = JSON.parse(readUrlResponse.body.toString("utf8")) as {
      data?: {
        authorized?: boolean;
        attachment_id?: string;
        attachmentId?: string;
        name?: string;
        download_url?: string;
        downloadUrl?: string;
        expires_at?: string;
        expiresAt?: string;
      };
    };
    const rawDownloadUrl =
      readUrlData?.data?.download_url || readUrlData?.data?.downloadUrl || "";
    expect(
      readUrlData?.data?.authorized,
      "read-url must return authorized=true",
    ).toBe(true);
    expect(
      readUrlData?.data?.attachment_id || readUrlData?.data?.attachmentId,
      "read-url attachment_id must match",
    ).toBe(attachmentId);
    expect(readUrlData?.data?.name, "read-url name must match").toBe(
      originalFileName,
    );
    expect(
      readUrlData?.data?.expires_at || readUrlData?.data?.expiresAt,
      "read-url must include expires_at",
    ).toBeTruthy();
    expect(rawDownloadUrl, "read-url must include download_url").toBeTruthy();

    const parsedDownloadUrl = new URL(rawDownloadUrl, origin);
    expect(
      parsedDownloadUrl.origin,
      "signed download URL must be same origin",
    ).toBe(new URL(origin).origin);
    expect(
      parsedDownloadUrl.username,
      "signed download URL must not contain credentials",
    ).toBe("");
    expect(
      parsedDownloadUrl.password,
      "signed download URL must not contain credentials",
    ).toBe("");
    if (parsedDownloadUrl.pathname.startsWith("/api/")) {
      parsedDownloadUrl.pathname = parsedDownloadUrl.pathname.replace(
        /^\/api\//,
        "/control-plane-proxy/",
      );
    }
    expect(
      parsedDownloadUrl.pathname,
      "signed download URL pathname must match case attachment download route",
    ).toBe(
      `${parentPrefix}/attachments/${encodeURIComponent(attachmentId!)}/download`,
    );
    expect(
      parsedDownloadUrl.searchParams.get("expiresAt"),
      "signed download URL must bind expiresAt",
    ).toBeTruthy();
    expect(
      parsedDownloadUrl.searchParams.get("sig"),
      "signed download URL must bind sig",
    ).toBeTruthy();
    expect(
      parsedDownloadUrl.hash,
      "signed download URL must not contain fragment",
    ).toBe("");

    // Hop 7: Signed download readback
    const downloadResponse = await boundedFetch(parsedDownloadUrl.toString(), {
      method: "GET",
      headers: lifecycleHeaders,
    });
    checkDeadline();
    expect(
      downloadResponse.status,
      `GET readback from ${parsedDownloadUrl.toString()}`,
    ).toBe(200);
    expectCandidateRevision(
      downloadResponse.headers,
      `GET readback from ${parsedDownloadUrl.toString()}`,
    );

    const readbackBuffer = downloadResponse.body;
    const readbackSha256 = createHash("sha256")
      .update(readbackBuffer)
      .digest("hex");
    expect(readbackSha256, "readback checksum").toBe(sha256);
    expect(readbackBuffer.length, "readback file_size").toBe(fileSize);

    const returnedType = downloadResponse.headers.get("content-type") || "";
    expect(
      (returnedType.split(";")[0] || "").trim().toLowerCase(),
      `readback content_type exactly ${contentType}`,
    ).toBe(contentType);

    return {
      objectKey,
      sha256,
      fileSize,
      intentAttempts: 1,
      putAttempts,
      confirmAttempts: 1,
      downloadAttempts: 1,
      documentId: attachmentId!,
      attachmentId: attachmentId!,
      intentStatus: intentResponse.status,
      putStatus,
      putScanState,
      confirmStatus: confirmResponse.status,
      confirmCaseId: expectedCaseId,
      confirmFleetPartnerId: authoritativeFleetId,
      confirmAttachmentState: confirmState || "done",
      canonicalReadbackStatus: canonicalCaseResponse.status,
      readUrlStatus: readUrlResponse.status,
      signedDownloadUrl: parsedDownloadUrl.toString(),
      downloadStatus: downloadResponse.status,
      readbackSha256,
      readbackFileSize: readbackBuffer.length,
      readbackContentType: returnedType,
      transientHistory,
    };
  }

  const parentPrefix = supplyParentPrefixMatch![1] as string;
  const expectedSubmissionId = supplyParentPrefixMatch![2] as string;

  expect(confirmPathname, "confirm URL pathname must match parent scope").toBe(
    `${parentPrefix}/documents/confirm`,
  );

  const requestedSupplyDocumentType = String(
    intentBody.documentType ?? confirmBody.documentType ?? "",
  ).trim();
  if (
    !(ALLOWED_SUPPLY_DOCUMENT_TYPES as readonly string[]).includes(
      requestedSupplyDocumentType,
    )
  ) {
    throw new Error(
      `supply documentType must be an authorized enum value (no invented photo enum), got ${requestedSupplyDocumentType}`,
    );
  }

  // R4: Authoritative Fleet readback
  const readbackResponse = await boundedFetch(
    new URL(parentPrefix, origin).toString(),
    {
      method: "GET",
      headers: lifecycleHeaders,
    },
  );
  checkDeadline();
  expect(readbackResponse.status, `readback submission ${parentPrefix}`).toBe(
    200,
  );
  expectCandidateRevision(
    readbackResponse.headers,
    `readback submission ${parentPrefix}`,
  );
  const readbackData = JSON.parse(
    readbackResponse.body.toString("utf8"),
  ) as any;
  const authoritativeFleetId =
    readbackData?.data?.submission?.fleet_id ||
    readbackData?.data?.submission?.fleet_partner_id ||
    readbackData?.data?.fleet_id ||
    readbackData?.data?.fleet_partner_id;
  const authoritativeSubmissionId =
    readbackData?.data?.submission?.submission_id ||
    readbackData?.data?.submission?.id;
  const authoritativeSubmissionType =
    readbackData?.data?.submission?.submission_type ||
    readbackData?.data?.submission?.submissionType;
  expect(authoritativeFleetId, "authoritative expected fleet").toBeTruthy();
  expect(
    authoritativeSubmissionId,
    "authoritative submission ID must match intent URL",
  ).toBe(expectedSubmissionId);
  if (
    authoritativeSubmissionType === "driver" &&
    !(DRIVER_SUPPLY_DOCUMENT_TYPES as readonly string[]).includes(
      requestedSupplyDocumentType,
    )
  ) {
    throw new Error(
      `driver supply submission ${expectedSubmissionId} does not allow documentType ${requestedSupplyDocumentType}`,
    );
  } else if (
    authoritativeSubmissionType === "vehicle" &&
    !(VEHICLE_SUPPLY_DOCUMENT_TYPES as readonly string[]).includes(
      requestedSupplyDocumentType,
    )
  ) {
    throw new Error(
      `vehicle supply submission ${expectedSubmissionId} does not allow documentType ${requestedSupplyDocumentType}`,
    );
  }

  const cleanSupplyIntentBody = Object.fromEntries(
    Object.entries(intentBody).filter(
      ([key]) => !["contentType", "originalFileName", "fileName"].includes(key),
    ),
  );

  // 1. Intent execution
  const intentResponse = await boundedFetch(parsedIntentUrl.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({
      ...cleanSupplyIntentBody,
      contentType,
      originalFileName,
    }),
  });
  checkDeadline();
  expect(
    [200, 201].includes(intentResponse.status),
    `intent request to ${intentPath} must be 200 or 201, got ${intentResponse.status}`,
  ).toBeTruthy();
  expectCandidateRevision(
    intentResponse.headers,
    `intent request to ${intentPath}`,
  );

  const intentText = intentResponse.body.toString("utf8");
  const intentData = JSON.parse(intentText) as {
    data: {
      object_key: string;
      upload_url: string;
      method: string;
      headers: Record<string, string>;
      submission_id?: string;
      fleet_partner_id?: string;
    };
  };

  const objectKey = intentData.data.object_key;
  const rawUploadUrl = intentData.data.upload_url;
  const uploadMethod = intentData.data.method;
  const uploadHeaders = intentData.data.headers;

  expect(objectKey, "object_key from intent").toBeTruthy();
  expect(
    objectKey.startsWith(
      `fleet-partner/${authoritativeFleetId}/supply-submissions/${expectedSubmissionId}/`,
    ),
    "object_key must begin with exact authoritative prefix",
  ).toBeTruthy();

  if (intentData.data.submission_id) {
    expect(
      intentData.data.submission_id,
      "intent submission_id must match",
    ).toBe(expectedSubmissionId);
  }

  expect(rawUploadUrl, "upload_url from intent").toBeTruthy();
  expect(uploadMethod, "upload method must be exactly provided").toBe("PUT");
  expect(uploadHeaders, "upload headers must be exactly provided").toBeTruthy();
  expect(
    uploadHeaders["Content-Type"] || uploadHeaders["content-type"],
    "must contain application/octet-stream",
  ).toBe("application/octet-stream");

  const parsedUploadUrl = new URL(rawUploadUrl, origin);
  expect(parsedUploadUrl.origin, "upload URL must be same origin").toBe(
    new URL(origin).origin,
  );
  expect(
    parsedUploadUrl.username,
    "upload URL must not contain credentials",
  ).toBe("");
  expect(
    parsedUploadUrl.password,
    "upload URL must not contain credentials",
  ).toBe("");

  if (parsedUploadUrl.pathname.startsWith("/api/")) {
    parsedUploadUrl.pathname = parsedUploadUrl.pathname.replace(
      /^\/api\//,
      "/control-plane-proxy/",
    );
  }
  expect(
    parsedUploadUrl.pathname,
    "upload URL pathname must match parent scope",
  ).toBe(`${parentPrefix}/documents/content`);
  expect(
    parsedUploadUrl.searchParams.get("objectKey") ||
      parsedUploadUrl.searchParams.get("object_key"),
    "upload URL must bind objectKey",
  ).toBe(objectKey);
  expect(
    Array.from(parsedUploadUrl.searchParams.keys()).length,
    "upload URL must not contain extra queries",
  ).toBe(1);
  expect(parsedUploadUrl.hash, "upload URL must not contain fragment").toBe("");

  const uploadUrl = parsedUploadUrl.toString();
  const putHeaders = new Headers(uploadHeaders);
  lifecycleHeaders.forEach((value, name) => {
    if (name !== "content-type") putHeaders.set(name, value);
  });

  // 2. PUT exact bytes
  let scanReceiptOk = false;
  let putAttempts = 0;
  let putStatus = 0;
  let putScanState = "";
  const transientHistory: string[] = [];
  const maxAttempts = 45;

  while (
    !scanReceiptOk &&
    putAttempts < maxAttempts &&
    getRemainingTime() > 0
  ) {
    putAttempts++;
    const putResponse = await boundedFetch(uploadUrl, {
      method: "PUT",
      headers: putHeaders,
      body: fixtureBytes,
    });
    checkDeadline();

    putStatus = putResponse.status;
    if (putResponse.status === 503) {
      const errText = putResponse.body.toString("utf8");
      const errBody = JSON.parse(errText || "{}");
      checkDeadline();
      expectCandidateRevision(
        putResponse.headers,
        `PUT exact bytes transient error to ${uploadUrl}`,
      );
      transientHistory.push(errBody?.error?.code || "unknown_503");
      if (errBody?.error?.code === "DOCUMENT_SCANNER_UNAVAILABLE") {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(1000, getRemainingTime())),
        );
        checkDeadline();
        continue;
      }
    }

    expect(
      [200, 201].includes(putResponse.status),
      `PUT exact bytes to ${uploadUrl} must be 200 or 201, got ${putResponse.status}`,
    ).toBeTruthy();
    expectCandidateRevision(
      putResponse.headers,
      `PUT exact bytes to ${uploadUrl}`,
    );

    const putText = putResponse.body.toString("utf8");
    const putData = JSON.parse(putText) as {
      data?: {
        checksum_sha256?: string;
        file_size?: number;
        scan_state?: string;
      };
    };
    checkDeadline();
    expect(putData?.data?.checksum_sha256, "PUT checksum").toBe(sha256);
    expect(putData?.data?.file_size, "PUT file_size").toBe(fileSize);
    expect(putData?.data?.scan_state, "PUT scan_state").toBe("clean");
    putScanState = putData?.data?.scan_state || "";
    scanReceiptOk = true;
  }
  expect(
    scanReceiptOk,
    "Scanner must eventually process the bytes and return clean receipt within deadline",
  ).toBeTruthy();

  // 3. Confirm (R3 validate first)
  const cleanSupplyConfirmBody = Object.fromEntries(
    Object.entries(confirmBody).filter(
      ([key]) => !["contentType", "originalFileName", "fileName"].includes(key),
    ),
  );
  const finalConfirmBody = {
    ...cleanSupplyConfirmBody,
    objectKey,
    contentType,
    fileSize,
    checksumSha256: sha256,
    originalFileName,
  };

  const confirmResponse = await boundedFetch(parsedConfirmUrl.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(finalConfirmBody),
  });
  checkDeadline();
  expect(
    [200, 201].includes(confirmResponse.status),
    `confirm request to ${confirmPath} must be 200 or 201, got ${confirmResponse.status}`,
  ).toBeTruthy();
  expectCandidateRevision(
    confirmResponse.headers,
    `confirm request to ${confirmPath}`,
  );

  const confirmText = confirmResponse.body.toString("utf8");
  const confirmData = JSON.parse(confirmText) as {
    data?: {
      document_id?: string;
      documentId?: string;
      file_object_key?: string;
      fileObjectKey?: string;
      checksum_sha256?: string;
      checksumSha256?: string;
      file_size?: number;
      fileSize?: number;
      content_type?: string;
      contentType?: string;
      submission_id?: string;
      submissionId?: string;
      fleet_partner_id?: string;
      fleetPartnerId?: string;
      document_type?: string;
      documentType?: string;
    };
  };
  checkDeadline();

  const documentId =
    confirmData?.data?.document_id || confirmData?.data?.documentId;
  const confirmObjKey =
    confirmData?.data?.file_object_key || confirmData?.data?.fileObjectKey;
  const confirmHash =
    confirmData?.data?.checksum_sha256 || confirmData?.data?.checksumSha256;
  const confirmSize =
    confirmData?.data?.file_size || confirmData?.data?.fileSize;
  const confirmType =
    confirmData?.data?.content_type || confirmData?.data?.contentType;
  const confirmSubmissionId =
    confirmData?.data?.submission_id || confirmData?.data?.submissionId;
  const confirmFleetId =
    confirmData?.data?.fleet_partner_id || confirmData?.data?.fleetPartnerId;
  const confirmDocType =
    confirmData?.data?.document_type || confirmData?.data?.documentType;

  expect(documentId, "confirm must return documentId").toBeTruthy();
  expect(documentId, "documentId must be a strict single segment").toMatch(
    /^[-a-zA-Z0-9_]+$/,
  );
  expect(confirmObjKey, "confirm object key metadata").toBe(objectKey);
  expect(confirmHash, "confirm hash metadata").toBe(sha256);
  expect(confirmSize, "confirm size metadata").toBe(fileSize);
  expect(confirmType, "confirm mime metadata").toBe(contentType);
  expect(
    confirmSubmissionId,
    "confirm submission_id metadata must match URL",
  ).toBe(expectedSubmissionId);
  expect(
    confirmDocType,
    "confirm document_type metadata must match intent body",
  ).toBe(intentBody.documentType || confirmBody.documentType);

  // R4: Bind authoritative fleet
  expect(
    confirmFleetId,
    "confirm fleet_partner_id must match authoritative readback",
  ).toBe(authoritativeFleetId);

  // 4. Download READBACK
  const downloadPath = `${parentPrefix}/documents/${documentId}/download`;
  const parsedDownloadUrl = new URL(downloadPath, origin);
  if (parsedDownloadUrl.pathname.startsWith("/api/")) {
    parsedDownloadUrl.pathname = parsedDownloadUrl.pathname.replace(
      /^\/api\//,
      "/control-plane-proxy/",
    );
  }

  const downloadResponse = await boundedFetch(parsedDownloadUrl.toString(), {
    method: "GET",
    headers: lifecycleHeaders,
  });
  checkDeadline();
  expect(
    downloadResponse.status,
    `GET readback from ${parsedDownloadUrl.toString()}`,
  ).toBe(200);
  expectCandidateRevision(
    downloadResponse.headers,
    `GET readback from ${parsedDownloadUrl.toString()}`,
  );

  const readbackBuffer = downloadResponse.body;
  const readbackSha256 = createHash("sha256")
    .update(readbackBuffer)
    .digest("hex");
  expect(readbackSha256, "readback checksum").toBe(sha256);
  expect(readbackBuffer.length, "readback file_size").toBe(fileSize);

  // R4 strict MIME gap
  const returnedType = downloadResponse.headers.get("content-type") || "";
  expect(
    (returnedType.split(";")[0] || "").trim().toLowerCase(),
    `readback content_type exactly ${contentType}`,
  ).toBe(contentType);

  return {
    objectKey,
    sha256,
    fileSize,
    intentAttempts: 1,
    putAttempts,
    confirmAttempts: 1,
    downloadAttempts: 1,
    documentId: documentId!,
    intentStatus: intentResponse.status,
    putStatus,
    putScanState,
    confirmStatus: confirmResponse.status,
    ...(confirmSubmissionId ? { confirmSubmissionId } : {}),
    ...(confirmFleetId ? { confirmFleetPartnerId: confirmFleetId } : {}),
    ...(confirmDocType ? { confirmDocumentType: confirmDocType } : {}),
    downloadStatus: downloadResponse.status,
    readbackSha256,
    readbackFileSize: readbackBuffer.length,
    readbackContentType: returnedType,
    transientHistory,
  };
}

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type TemplateVariables = Record<string, unknown>;
export type HttpRequestSetup = {
  kind?: "http";
  baseUrlEnv?: string;
  path: string;
  method: HttpMethod;
  body?: unknown;
  headers?: Record<string, string>;
  capture?: Record<string, string>;
};
export type DocumentUploadSetup = {
  kind: "document-upload";
  baseUrlEnv?: string;
  reviewerBaseUrlEnv?: string;
  intentPath: string;
  intentBody: Record<string, unknown>;
  confirmPath: string;
  confirmBody: Record<string, unknown>;
  headers?: Record<string, string>;
  capture?: Record<string, string>;
};
export type FleetEditableCaseSetup = {
  kind: "fleet-editable-case";
  baseUrlEnv?: string;
  path?: string;
  expectedFleetPartnerId: string;
  periodMonths?: string[];
  capture?: Record<string, string>;
};
export type OperationalProbeRole =
  | "own_fleet"
  | "platform_reviewer"
  | "foreign_fleet"
  | "tenant_admin"
  | "tenant_ops"
  | "driver"
  | "ops_non_reviewer"
  | "unauthenticated"
  | "invalid_session";
export type RoleAccessProbeSetup = {
  kind: "role-access-probe";
  baseUrlEnv?: string;
  role: OperationalProbeRole;
  path: string;
  method: HttpMethod;
  body?: unknown;
  rawBodyContentType?: OperationalDocumentMimeType;
  headers?: Record<string, string>;
  expectedStatus: number | number[];
  expectedErrorCode?: string;
  verifySession?: boolean;
  expectedOwnFleetId?: string;
};
export type SetupRequest =
  | HttpRequestSetup
  | DocumentUploadSetup
  | FleetEditableCaseSetup
  | RoleAccessProbeSetup;
export type DocumentAcceptanceManifest = {
  id: string;
  surface: string;
  baseUrlEnv: string;
  actorScope: string;
  setup: SetupRequest[];
};
export type Journey = {
  id: string;
  surface: string;
  baseUrlEnv: string;
  route: string;
  actorScope: string;
  environmentVariables?: Record<string, string>;
  setup?: SetupRequest[];
  [key: string]: any;
};

export function requiredOrigin(envName: string) {
  const value = process.env[envName]?.trim();
  if (!value) {
    throw new Error(
      `${envName} is required: release acceptance must target a deployed candidate URL.`,
    );
  }
  return new URL(value).toString();
}

export function getIdentityToken(baseUrlEnv?: string): string | undefined {
  if (!baseUrlEnv) return undefined;
  if (
    baseUrlEnv === "DRTS_OPERATIONAL_TENANT_CONSOLE_URL" ||
    baseUrlEnv === "DRTS_DEV_TENANT_CONSOLE_BASE_URL"
  ) {
    return (
      process.env.DRTS_OPERATIONAL_TENANT_CONSOLE_ID_TOKEN ||
      process.env.DRTS_DEV_TENANT_CONSOLE_ID_TOKEN
    );
  }
  if (
    baseUrlEnv === "DRTS_OPERATIONAL_BANK_CONSOLE_URL" ||
    baseUrlEnv === "DRTS_DEV_BANK_CONSOLE_BASE_URL"
  ) {
    return (
      process.env.DRTS_OPERATIONAL_BANK_CONSOLE_ID_TOKEN ||
      process.env.DRTS_DEV_BANK_CONSOLE_ID_TOKEN
    );
  }
  if (
    baseUrlEnv === "DRTS_OPERATIONAL_ENTERPRISE_DISPATCH_URL" ||
    baseUrlEnv === "DRTS_DEV_ENTERPRISE_DISPATCH_BASE_URL"
  ) {
    return (
      process.env.DRTS_OPERATIONAL_ENTERPRISE_DISPATCH_ID_TOKEN ||
      process.env.DRTS_DEV_ENTERPRISE_DISPATCH_ID_TOKEN
    );
  }
  if (
    baseUrlEnv === "DRTS_OPERATIONAL_PLATFORM_ADMIN_URL" ||
    baseUrlEnv === "DRTS_DEV_PLATFORM_ADMIN_BASE_URL"
  ) {
    return (
      process.env.DRTS_OPERATIONAL_PLATFORM_ADMIN_ID_TOKEN ||
      process.env.DRTS_DEV_PLATFORM_ADMIN_ID_TOKEN
    );
  }
  if (
    baseUrlEnv === "DRTS_OPERATIONAL_OPS_CONSOLE_URL" ||
    baseUrlEnv === "DRTS_DEV_OPS_CONSOLE_BASE_URL"
  ) {
    return (
      process.env.DRTS_OPERATIONAL_OPS_CONSOLE_ID_TOKEN ||
      process.env.DRTS_DEV_OPS_CONSOLE_ID_TOKEN
    );
  }
  if (
    baseUrlEnv === "DRTS_OPERATIONAL_FLEET_PARTNER_PORTAL_URL" ||
    baseUrlEnv === "DRTS_DEV_FLEET_PARTNER_PORTAL_BASE_URL"
  ) {
    return (
      process.env.DRTS_OPERATIONAL_FLEET_PARTNER_PORTAL_ID_TOKEN ||
      process.env.DRTS_DEV_FLEET_PARTNER_PORTAL_ID_TOKEN
    );
  }
  if (
    baseUrlEnv === "DRTS_OPERATIONAL_CHANNEL_PARTNER_PORTAL_URL" ||
    baseUrlEnv === "DRTS_DEV_CHANNEL_PARTNER_PORTAL_BASE_URL"
  ) {
    return (
      process.env.DRTS_OPERATIONAL_CHANNEL_PARTNER_PORTAL_ID_TOKEN ||
      process.env.DRTS_DEV_CHANNEL_PARTNER_PORTAL_ID_TOKEN
    );
  }
  if (
    baseUrlEnv === "DRTS_OPERATIONAL_API_URL" ||
    baseUrlEnv === "DRTS_DEV_API_BASE_URL"
  ) {
    return (
      process.env.DRTS_OPERATIONAL_API_ID_TOKEN ||
      process.env.DRTS_DEV_API_ID_TOKEN
    );
  }
  return undefined;
}

function isFleetOriginEnvironment(baseUrlEnv: string) {
  return (
    baseUrlEnv === "DRTS_OPERATIONAL_FLEET_PARTNER_PORTAL_URL" ||
    baseUrlEnv === "DRTS_DEV_FLEET_PARTNER_PORTAL_BASE_URL"
  );
}

export type FleetApplicationSetup = {
  fleetPartnerId: string;
  tenantId: string;
};
export type PreparedOperationalFleetSession = {
  metadata: Record<string, string>;
  cleanup: () => Promise<void>;
};
let verifiedFleetSessionToken: string | undefined;
let verifiedAdminSessionToken: string | undefined;

const FORBIDDEN_IDENTITY_SPOOF_HEADERS = new Set([
  "x-realm",
  "x-roles",
  "x-role-families",
  "x-actor-id",
  "x-actor-type",
  "x-scopes",
  "x-auth-mode",
]);

function rejectSpoofedIdentityHeaders(headers: Record<string, string>) {
  for (const name of Object.keys(headers)) {
    if (FORBIDDEN_IDENTITY_SPOOF_HEADERS.has(name.toLowerCase())) {
      throw new Error(
        `Spoofed identity header ${name} is forbidden; operational harness must use verified backend sessions`,
      );
    }
  }
}

function maskOperationalSecret(value: string) {
  if (process.env.GITHUB_ACTIONS === "true") {
    const escaped = value
      .replace(/%/g, "%25")
      .replace(/\r/g, "%0D")
      .replace(/\n/g, "%0A");
    process.stdout.write(`::add-mask::${escaped}\n`);
  }
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

// Only these public error codes may leave the secret-bearing native issuer.
const operationalAuthErrorCodes = new Set([
  "AUTHENTICATION_REQUIRED",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "MFA_REQUIRED",
  "STEP_UP_REQUIRED",
  "SESSION_REVOKED",
  "SESSION_EXPIRED",
  "TOKEN_INVALID",
  "IDENTITY_REQUIRED",
  "MEMBERSHIP_NOT_FOUND",
  "WORKLOAD_SESSION_IDENTITY_UNAVAILABLE",
  "DEV_WORKFORCE_SESSION_EXCHANGE_DENIED",
  "AUTH_TOKEN_EXCHANGE_NOT_ALLOWED",
]);
class OperationalFleetSetupError extends Error {
  constructor(stage: string, status?: number, code?: string) {
    super(
      `Fleet application setup ${stage} failed${status ? ` (HTTP ${status}${code ? ` code ${code}` : ""})` : ""}`,
    );
  }
}

/** Normal application onboarding, once per worker (workers may restart).
 * All secret-bearing requests use native fetch, never Playwright request/trace.
 * The optional Fleet reference is implemented by the independently reviewed
 * canonical-binding product task; an old server's random binding is rejected.
 */
export async function prepareOperationalFleetSession(
  configuration: FleetApplicationSetup,
): Promise<PreparedOperationalFleetSession> {
  const requireValue = (condition: unknown, stage: string) => {
    if (!condition) throw new OperationalFleetSetupError(stage);
  };
  requireValue(
    configuration?.fleetPartnerId?.trim() && configuration?.tenantId?.trim(),
    "configuration",
  );
  const configuredOrigin = (envName: string) => {
    try {
      const url = new URL(requiredOrigin(envName));
      requireValue(
        url.protocol === "https:" &&
          !url.username &&
          !url.password &&
          !url.search &&
          !url.hash &&
          url.pathname === "/",
        "configured origin",
      );
      return url.origin;
    } catch {
      throw new OperationalFleetSetupError("configured origin");
    }
  };
  const apiOrigin = configuredOrigin("DRTS_OPERATIONAL_API_URL");
  const suppliedToken =
    process.env.DRTS_OPERATIONAL_FLEET_SESSION_TOKEN?.trim();
  if (suppliedToken) maskOperationalSecret(suppliedToken);
  const deadline = Date.now() + 60_000;
  let adminOrigin: string | undefined;
  let adminInvocation: string | undefined;
  let adminSessionToken: string | undefined;
  let ownAdminSessionId: string | undefined;
  let adminSessionRevoked = false;
  const requestId = `operational-fleet-${randomUUID()}`;
  const entrySlug = requestId;
  const programId = `${requestId}-program`;
  const entryPath = `/control-plane-proxy/platform-admin/partner-entries/${encodeURIComponent(entrySlug)}`;
  let ownEntry = false;
  let entryHasUnownedCredentials = false;
  let ownKeyId: string | undefined;
  let applicationToken: string | undefined;
  let ownSessionId: string | undefined;
  let sessionRevoked = false;
  let keyRevoked = false;
  let entryRevoked = false;

  async function request(
    stage: string,
    role: "admin" | "api",
    pathname: string,
    options: {
      method?: string;
      body?: unknown;
      token?: string;
      stepUpReference?: string;
      until?: number;
      acknowledge?: (data: Record<string, unknown>) => void;
    } = {},
  ): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let abortListener: (() => void) | undefined;
    try {
      const origin = role === "admin" ? adminOrigin : apiOrigin;
      requireValue(origin, stage);
      const url = new URL(pathname, origin);
      requireValue(
        url.origin === origin &&
          !url.username &&
          !url.password &&
          !url.hash &&
          !url.search,
        stage,
      );
      const until = options.until ?? deadline;
      const remaining = until - Date.now();
      requireValue(remaining > 0, `${stage} deadline`);
      const aborted = new Promise<never>((_, reject) => {
        abortListener = () => reject(new OperationalFleetSetupError(stage));
        controller.signal.addEventListener("abort", abortListener, {
          once: true,
        });
      });
      timer = setTimeout(() => controller.abort(), Math.min(15_000, remaining));
      const token = role === "admin" ? adminInvocation : options.token;
      const response = await Promise.race([
        fetch(url.toString(), {
          method: options.method ?? "GET",
          redirect: "manual",
          signal: controller.signal,
          headers: {
            "x-request-id": requestId,
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(role === "admin" && adminSessionToken
              ? { "x-drts-authorization": `Bearer ${adminSessionToken}` }
              : {}),
            ...(options.stepUpReference
              ? { "x-drts-step-up-reference": options.stepUpReference }
              : {}),
            ...(options.body !== undefined
              ? { "Content-Type": "application/json" }
              : {}),
          },
          ...(options.body !== undefined
            ? { body: JSON.stringify(options.body) }
            : {}),
        }),
        aborted,
      ]);
      reader = response.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (reader) {
        while (true) {
          const chunk = await Promise.race([reader.read(), aborted]);
          if (chunk.done) break;
          size += chunk.value.byteLength;
          requireValue(size <= 1024 * 1024, `${stage} response bound`);
          chunks.push(chunk.value);
        }
      }
      let payload: Record<string, unknown> = {};
      try {
        payload = objectValue(
          normalizeApiResponse(
            JSON.parse(Buffer.concat(chunks).toString("utf8")),
          ),
        );
      } catch {
        // An error response can be non-JSON; retain status, never its raw body.
        requireValue(response.status !== 200 && response.status !== 201, stage);
      }
      if (response.status !== 200 && response.status !== 201) {
        const code = objectValue(payload.error).code ?? payload.code;
        throw new OperationalFleetSetupError(
          stage,
          response.status,
          typeof code === "string" && operationalAuthErrorCodes.has(code)
            ? code
            : undefined,
        );
      }
      const candidate = process.env.DRTS_CANDIDATE_SHA?.trim();
      requireValue(
        !candidate ||
          response.headers.get("x-drts-candidate-sha") === candidate,
        `${stage} candidate`,
      );
      // auth/token keeps its established top-level token response. Other calls
      // use the API envelope; normalize keys, never credential scalar values.
      const data = objectValue(
        pathname === "/control-plane-proxy/auth/token" ? payload : payload.data,
      );
      // Capture only server-acknowledged exact ownership before rejecting a late
      // ACK, so deadline failure still runs cleanup of the resource it created.
      options.acknowledge?.(data);
      requireValue(Date.now() < until, `${stage} deadline`);
      return data;
    } catch (error) {
      // Neither native errors, response messages nor headers may expose secrets.
      throw error instanceof OperationalFleetSetupError
        ? error
        : new OperationalFleetSetupError(stage);
    } finally {
      if (timer) clearTimeout(timer);
      if (abortListener)
        controller.signal.removeEventListener("abort", abortListener);
      if (reader) {
        void reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    }
  }

  async function adminMutation(
    stage: string,
    pathname: string,
    actionId: string,
    body: unknown,
    until = deadline,
    acknowledge?: (data: Record<string, unknown>) => void,
  ) {
    requireValue(adminSessionToken, `${stage} Admin session`);
    const proof = await request(
      `${stage} step up`,
      "admin",
      "/control-plane-proxy/identity/step-up-proofs",
      {
        method: "POST",
        body: {
          method: "POST",
          path: pathname.replace(/^\/control-plane-proxy\//, "/api/"),
        },
        until,
      },
    );
    if (typeof proof.stepUpReference === "string")
      maskOperationalSecret(proof.stepUpReference);
    requireValue(
      proof.required === true &&
        proof.actionId === actionId &&
        typeof proof.stepUpReference === "string" &&
        proof.stepUpReference.trim(),
      `${stage} step up receipt`,
    );
    return request(stage, "admin", pathname, {
      method: "POST",
      body,
      stepUpReference: proof.stepUpReference as string,
      until,
      ...(acknowledge ? { acknowledge } : {}),
    });
  }

  const verifyIdentity = (
    data: Record<string, unknown>,
    issued: boolean,
    activeSession = true,
  ) => {
    const identity = objectValue(data.identity);
    requireValue(
      (!activeSession || data.active === true) &&
        identity.realm === "partner" &&
        ["partner_user", "partner_api_key"].includes(
          String(identity.actorType),
        ) &&
        typeof identity.actorId === "string" &&
        identity.actorId.trim() &&
        identity.partnerId === configuration.fleetPartnerId &&
        Array.isArray(identity.scopes) &&
        identity.scopes.includes("billing:read"),
      "verified session",
    );
    if (issued) {
      requireValue(
        identity.actorType === "partner_api_key" &&
          identity.actorId === ownKeyId &&
          identity.partnerEntrySlug === entrySlug &&
          identity.tenantId === configuration.tenantId &&
          identity.partnerProgramId === programId &&
          Array.isArray(identity.scopes) &&
          identity.scopes.length === 1 &&
          (!activeSession || identity.principalId === ownKeyId),
        "issued session binding",
      );
    }
    return identity;
  };

  const cleanup = async () => {
    const failures: string[] = [];
    const until = Date.now() + 20_000;
    if (ownEntry) {
      if (applicationToken && ownSessionId && !sessionRevoked) {
        try {
          const data = await request(
            "own session revoke",
            "api",
            "/api/auth/sessions/revoke",
            {
              method: "POST",
              token: applicationToken,
              body: { sessionId: ownSessionId },
              until,
            },
          );
          requireValue(
            data.revoked === true && data.sessionId === ownSessionId,
            "own session revoke receipt",
          );
          sessionRevoked = true;
        } catch (error) {
          failures.push(
            error instanceof OperationalFleetSetupError
              ? error.message
              : "session",
          );
        }
      }
      if (ownKeyId && !keyRevoked) {
        try {
          const data = await adminMutation(
            "own key revoke",
            `${entryPath}/credentials/${encodeURIComponent(ownKeyId)}/revoke`,
            "platform:partner-credentials:revoke",
            { revokeReason: "operational_worker_finished" },
            until,
          );
          requireValue(
            data.keyId === ownKeyId &&
              data.entrySlug === entrySlug &&
              typeof data.revokedAt === "string",
            "own key revoke receipt",
          );
          keyRevoked = true;
        } catch (error) {
          failures.push(
            error instanceof OperationalFleetSetupError ? error.message : "key",
          );
        }
      }
      if (entryHasUnownedCredentials)
        failures.push("entry has unowned credentials; preserved");
      else if (!entryRevoked) {
        try {
          const data = await adminMutation(
            "own entry revoke",
            `${entryPath}/revoke`,
            "platform:partner-entries:revoke",
            {},
            until,
          );
          requireValue(
            data.entrySlug === entrySlug &&
              data.status === "revoked" &&
              data.activeFlag === false,
            "own entry revoke receipt",
          );
          entryRevoked = true;
        } catch (error) {
          failures.push(
            error instanceof OperationalFleetSetupError
              ? error.message
              : "entry",
          );
        }
      }
    }
    // The Admin session is owned independently of the Entry ACK. Keep it alive
    // until both action-specific revoke proofs have been consumed.
    if (adminSessionToken && ownAdminSessionId && !adminSessionRevoked) {
      try {
        const data = await request(
          "own Admin session revoke",
          "api",
          "/api/auth/sessions/revoke",
          {
            method: "POST",
            token: adminSessionToken,
            body: { sessionId: ownAdminSessionId },
            until,
          },
        );
        requireValue(
          data.revoked === true && data.sessionId === ownAdminSessionId,
          "own Admin session revoke receipt",
        );
        adminSessionRevoked = true;
      } catch (error) {
        failures.push(
          error instanceof OperationalFleetSetupError
            ? error.message
            : "Admin session",
        );
      }
    }
    if (verifiedFleetSessionToken === applicationToken)
      verifiedFleetSessionToken = undefined;
    if (verifiedAdminSessionToken === adminSessionToken)
      verifiedAdminSessionToken = undefined;
    if (failures.length) {
      // IDs are non-secret recovery metadata; never include key/token material.
      throw new Error(
        `Fleet application own cleanup failed (${failures.join(",")}); entry ${entrySlug}`,
      );
    }
  };

  try {
    if (suppliedToken) {
      const identity = verifyIdentity(
        await request("provided session", "api", "/api/auth/session", {
          token: suppliedToken,
        }),
        false,
      );
      applicationToken = suppliedToken;
      verifiedFleetSessionToken = suppliedToken;
      return {
        metadata: {
          source: "provided-session",
          partnerId: configuration.fleetPartnerId,
          actorId: String(identity.actorId),
        },
        cleanup,
      };
    }
    adminOrigin = configuredOrigin("DRTS_OPERATIONAL_PLATFORM_ADMIN_URL");
    requireValue(adminOrigin !== apiOrigin, "origin isolation");
    adminInvocation = getIdentityToken(
      "DRTS_OPERATIONAL_PLATFORM_ADMIN_URL",
    )?.trim();
    requireValue(adminInvocation, "existing Admin invocation proof");
    if (adminInvocation) maskOperationalSecret(adminInvocation);
    const suppliedAdminToken =
      process.env.DRTS_OPERATIONAL_PLATFORM_ADMIN_SESSION_TOKEN?.trim();
    let issuedAdminPrincipalId: string | undefined;
    const acknowledgeAdminSession = (issued: Record<string, unknown>) => {
      if (typeof issued.token === "string") maskOperationalSecret(issued.token);
      requireValue(
        typeof issued.token === "string" &&
          issued.token.trim() &&
          issued.realm === "platform" &&
          issued.actorType === "platform_admin" &&
          typeof issued.principalId === "string" &&
          issued.principalId.trim() &&
          typeof issued.sessionId === "string" &&
          issued.sessionId.trim(),
        "Admin token receipt",
      );
      adminSessionToken = issued.token as string;
      ownAdminSessionId = issued.sessionId as string;
      issuedAdminPrincipalId = issued.principalId as string;
    };
    if (suppliedAdminToken) {
      maskOperationalSecret(suppliedAdminToken);
      adminSessionToken = suppliedAdminToken;
    } else {
      await request(
        "Admin token exchange",
        "admin",
        "/control-plane-proxy/auth/token",
        {
          method: "POST",
          body: {},
          acknowledge: acknowledgeAdminSession,
        },
      );
    }
    const adminSession = await request(
      "Admin session",
      "admin",
      "/control-plane-proxy/auth/session",
    );
    const adminIdentity = objectValue(adminSession.identity);
    requireValue(
      adminSession.active === true &&
        adminIdentity.authMode === "jwt_bearer" &&
        adminIdentity.realm === "platform" &&
        adminIdentity.actorType === "platform_admin" &&
        [
          adminIdentity.actorId,
          adminIdentity.principalId,
          adminIdentity.membershipId,
          adminIdentity.sessionId,
        ].every((value) => typeof value === "string" && value.trim()) &&
        (suppliedAdminToken ||
          (adminIdentity.sessionId === ownAdminSessionId &&
            adminIdentity.principalId === issuedAdminPrincipalId)),
      "verified Admin session",
    );
    verifiedAdminSessionToken = adminSessionToken;
    const entry = await adminMutation(
      "create bound entry",
      "/control-plane-proxy/platform-admin/partner-entries",
      "platform:partner-entries:create",
      {
        tenantId: configuration.tenantId,
        partnerCode: requestId,
        partnerType: "fleet_partner",
        programId,
        entrySlug,
        displayName: "Synthetic operational Fleet caller",
        businessDispatchSubtype: "enterprise_dispatch",
        authMode: "partner_api_key",
        eligibilityMode: "none",
        fleetPartnerId: configuration.fleetPartnerId,
      },
      deadline,
      (ack) => {
        ownEntry =
          ack.entrySlug === entrySlug &&
          objectValue(ack.auditMetadata).requestId === requestId &&
          ack.tenantId === configuration.tenantId &&
          ack.programId === programId;
      },
    );
    requireValue(
      ownEntry &&
        entry.partnerId === configuration.fleetPartnerId &&
        entry.status === "active" &&
        entry.activeFlag === true,
      "created entry binding",
    );
    const credentials = await request(
      "own empty credentials",
      "admin",
      `${entryPath}/credentials`,
    );
    entryHasUnownedCredentials =
      !Array.isArray(credentials.items) || credentials.items.length !== 0;
    requireValue(!entryHasUnownedCredentials, "no existing keys to rotate");
    const issued = await adminMutation(
      "first key issue",
      `${entryPath}/credentials/issue`,
      "platform:partner-credentials:issue",
      {
        ownerRef: requestId,
        ownerName: "Synthetic operational worker",
        ownerType: "operational_acceptance",
        purpose: "Original operational document lifecycle acceptance",
        scopes: ["billing:read"],
        expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      },
      deadline,
      (ack) => {
        if (typeof ack.plaintextKey === "string")
          maskOperationalSecret(ack.plaintextKey);
        const credential = objectValue(ack.credential);
        if (
          credential.entrySlug === entrySlug &&
          typeof credential.keyId === "string" &&
          credential.keyId
        )
          ownKeyId = credential.keyId;
      },
    );
    const plaintextKey = issued.plaintextKey;
    const credential = objectValue(issued.credential);
    requireValue(
      ownKeyId &&
        typeof plaintextKey === "string" &&
        plaintextKey &&
        credential.realm === "partner" &&
        credential.resourceScope === `partner_entry:${entrySlug}` &&
        Array.isArray(credential.scopes) &&
        credential.scopes.length === 1 &&
        credential.scopes[0] === "billing:read" &&
        credential.status === "active" &&
        credential.revokedAt === null &&
        issued.revokedCredentialId === null &&
        issued.overlapEndsAt === null,
      "first key receipt",
    );
    const bootstrap = await request(
      "partner bootstrap",
      "api",
      "/api/auth/partner/bootstrap-session",
      {
        method: "POST",
        body: { entrySlug, apiKey: plaintextKey },
      },
    );
    if (typeof bootstrap.accessToken === "string")
      maskOperationalSecret(bootstrap.accessToken);
    requireValue(
      typeof bootstrap.accessToken === "string" &&
        bootstrap.accessToken &&
        bootstrap.tokenType === "Bearer" &&
        objectValue(bootstrap.partnerEntry).entrySlug === entrySlug &&
        objectValue(bootstrap.partnerEntry).partnerId ===
          configuration.fleetPartnerId,
      "bootstrap receipt",
    );
    verifyIdentity(bootstrap, true, false);
    applicationToken = bootstrap.accessToken as string;
    const session = await request(
      "issued session",
      "api",
      "/api/auth/session",
      {
        token: applicationToken,
        acknowledge: (ack) => {
          const identity = verifyIdentity(ack, true);
          requireValue(
            typeof identity.sessionId === "string" && identity.sessionId,
            "owned session receipt",
          );
          ownSessionId = identity.sessionId as string;
        },
      },
    );
    const identity = verifyIdentity(session, true);
    requireValue(
      typeof identity.sessionId === "string" && identity.sessionId,
      "owned session receipt",
    );
    ownSessionId = identity.sessionId as string;
    verifiedFleetSessionToken = applicationToken;
    return {
      metadata: {
        source: "worker-issued-session",
        partnerId: configuration.fleetPartnerId,
        actorId: String(identity.actorId),
        entrySlug,
        keyId: ownKeyId!,
      },
      cleanup,
    };
  } catch (error) {
    try {
      await cleanup();
    } catch (cleanupError) {
      throw new Error(
        `${error instanceof OperationalFleetSetupError ? error.message : "Fleet application setup failed"}; ${cleanupError instanceof Error ? cleanupError.message : "own cleanup failed"}`,
      );
    }
    const message =
      error instanceof OperationalFleetSetupError
        ? error.message
        : "Fleet application setup failed";
    throw new Error(
      `${message}; attempted entry ${entrySlug}; ownership ${ownEntry ? "acknowledged" : "not acknowledged"}`,
    );
  }
}

/** Invocation proof never establishes partner authority. The token below must
 * come from the existing legitimate backend issuer, with its real Fleet binding.
 * This harness only transports it; /api/auth/session and RoleAuth remain the authority.
 */
export function operationalRequestHeaders(
  baseUrlEnv: string,
  requestUrl: string,
  suppliedHeaders: Record<string, string> = {},
): Record<string, string> {
  const origin = new URL(requiredOrigin(baseUrlEnv)).origin;
  const target = new URL(requestUrl, origin);
  if (
    target.origin !== origin ||
    target.username ||
    target.password ||
    target.hash
  ) {
    throw new Error(
      "Operational request proof requires its exact credential-free origin and no fragment",
    );
  }
  rejectSpoofedIdentityHeaders(suppliedHeaders);
  const headers = { ...suppliedHeaders };
  const setupIdToken = getIdentityToken(baseUrlEnv);
  if (
    setupIdToken &&
    !Object.keys(headers).some((k) => k.toLowerCase() === "authorization")
  ) {
    headers["Authorization"] = `Bearer ${setupIdToken}`;
  }
  if (isFleetOriginEnvironment(baseUrlEnv)) {
    const token =
      verifiedFleetSessionToken ??
      process.env.DRTS_OPERATIONAL_FLEET_SESSION_TOKEN?.trim();
    if (!token || token === setupIdToken?.trim()) {
      throw new Error(
        "DRTS_OPERATIONAL_FLEET_SESSION_TOKEN requires an existing legitimate partner application session, distinct from Cloud Run invocation proof",
      );
    }
    const applicationProof = `Bearer ${token}`;
    for (const name of Object.keys(headers)) {
      if (name.toLowerCase() !== "x-drts-authorization") continue;
      if (headers[name] !== applicationProof) {
        throw new Error(
          "Fleet application proof must match its declared existing session",
        );
      }
      delete headers[name];
    }
    headers["x-drts-authorization"] = applicationProof;
  }
  return headers;
}

export function operationalReviewerRequestHeaders(
  baseUrlEnv: string,
  requestUrl: string,
  suppliedHeaders: Record<string, string> = {},
): Record<string, string> {
  const origin = new URL(requiredOrigin(baseUrlEnv)).origin;
  const target = new URL(requestUrl, origin);
  if (
    target.origin !== origin ||
    target.username ||
    target.password ||
    target.hash
  ) {
    throw new Error(
      "Operational reviewer request proof requires its exact credential-free origin and no fragment",
    );
  }
  rejectSpoofedIdentityHeaders(suppliedHeaders);
  const headers = { ...suppliedHeaders };
  const setupIdToken = getIdentityToken(baseUrlEnv);
  if (
    setupIdToken &&
    !Object.keys(headers).some((k) => k.toLowerCase() === "authorization")
  ) {
    headers["Authorization"] = `Bearer ${setupIdToken}`;
  }
  const reviewerToken =
    verifiedAdminSessionToken ??
    process.env.DRTS_OPERATIONAL_PLATFORM_REVIEWER_SESSION_TOKEN?.trim() ??
    process.env.DRTS_OPERATIONAL_PLATFORM_ADMIN_SESSION_TOKEN?.trim();
  if (reviewerToken && reviewerToken === setupIdToken?.trim()) {
    throw new Error(
      "Platform reviewer session token must be a legitimate backend application session distinct from Cloud Run invocation proof",
    );
  }
  if (reviewerToken) {
    const reviewerProof = `Bearer ${reviewerToken}`;
    for (const name of Object.keys(headers)) {
      if (name.toLowerCase() !== "x-drts-authorization") continue;
      if (headers[name] !== reviewerProof) {
        throw new Error(
          "Platform reviewer application proof must match its declared existing session",
        );
      }
      delete headers[name];
    }
    headers["x-drts-authorization"] = reviewerProof;
  }
  return headers;
}

export async function downloadOperationalDocumentAsReviewer(
  reviewerOrigin: string,
  reviewerBaseUrlEnv: string,
  target:
    | { kind: "supply"; submissionId: string; documentId: string }
    | { kind: "case"; caseId: string; attachmentId: string },
  expected: {
    sha256: string;
    fileSize: number;
    contentType: OperationalDocumentMimeType;
  },
): Promise<{
  downloadStatus: number;
  readbackSha256: string;
  readbackFileSize: number;
  readbackContentType: string;
}> {
  if (target.kind === "supply") {
    const downloadPath = `/control-plane-proxy/fleet-partner/supply-submissions/${encodeURIComponent(target.submissionId)}/documents/${encodeURIComponent(target.documentId)}/download`;
    const downloadUrl = new URL(downloadPath, reviewerOrigin).toString();
    const headers = operationalReviewerRequestHeaders(
      reviewerBaseUrlEnv,
      downloadUrl,
    );
    const response = await fetch(downloadUrl, {
      method: "GET",
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });
    expect(
      response.status,
      `Reviewer GET supply document download ${downloadUrl}`,
    ).toBe(200);
    expectCandidateRevision(
      response.headers,
      `Reviewer GET supply document download ${downloadUrl}`,
    );
    const body = Buffer.from(await response.arrayBuffer());
    const readbackSha256 = createHash("sha256").update(body).digest("hex");
    const returnedType = response.headers.get("content-type") || "";
    expect(readbackSha256, "Reviewer supply readback checksum").toBe(
      expected.sha256,
    );
    expect(body.length, "Reviewer supply readback file_size").toBe(
      expected.fileSize,
    );
    expect(
      (returnedType.split(";")[0] || "").trim().toLowerCase(),
      `Reviewer supply readback content_type exactly ${expected.contentType}`,
    ).toBe(expected.contentType);
    return {
      downloadStatus: response.status,
      readbackSha256,
      readbackFileSize: body.length,
      readbackContentType: returnedType,
    };
  }

  const readUrlPath = `/control-plane-proxy/fleet-partner/cases/${encodeURIComponent(target.caseId)}/attachments/${encodeURIComponent(target.attachmentId)}/read-url`;
  const readUrl = new URL(readUrlPath, reviewerOrigin).toString();
  const readUrlHeaders = operationalReviewerRequestHeaders(
    reviewerBaseUrlEnv,
    readUrl,
  );
  const readUrlResponse = await fetch(readUrl, {
    method: "GET",
    headers: readUrlHeaders,
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  expect(
    readUrlResponse.status,
    `Reviewer GET case attachment read-url ${readUrl}`,
  ).toBe(200);
  expectCandidateRevision(
    readUrlResponse.headers,
    `Reviewer GET case attachment read-url ${readUrl}`,
  );
  const readUrlPayload = (await readUrlResponse.json()) as {
    data?: {
      authorized?: boolean;
      attachment_id?: string;
      attachmentId?: string;
      download_url?: string;
      downloadUrl?: string;
    };
  };
  expect(
    readUrlPayload?.data?.authorized,
    "Reviewer case read-url must return authorized=true",
  ).toBe(true);
  expect(
    readUrlPayload?.data?.attachment_id || readUrlPayload?.data?.attachmentId,
    "Reviewer case read-url attachment_id must match",
  ).toBe(target.attachmentId);
  const rawDownloadUrl =
    readUrlPayload?.data?.download_url ||
    readUrlPayload?.data?.downloadUrl ||
    "";
  expect(
    rawDownloadUrl,
    "Reviewer case read-url must return download_url",
  ).toBeTruthy();

  const parsedDownloadUrl = new URL(rawDownloadUrl, reviewerOrigin);
  if (parsedDownloadUrl.pathname.startsWith("/api/")) {
    parsedDownloadUrl.pathname = parsedDownloadUrl.pathname.replace(
      /^\/api\//,
      "/control-plane-proxy/",
    );
  }
  const downloadHeaders = operationalReviewerRequestHeaders(
    reviewerBaseUrlEnv,
    parsedDownloadUrl.toString(),
  );
  const downloadResponse = await fetch(parsedDownloadUrl.toString(), {
    method: "GET",
    headers: downloadHeaders,
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  expect(
    downloadResponse.status,
    `Reviewer GET case attachment signed download ${parsedDownloadUrl.toString()}`,
  ).toBe(200);
  expectCandidateRevision(
    downloadResponse.headers,
    `Reviewer GET case attachment signed download ${parsedDownloadUrl.toString()}`,
  );
  const body = Buffer.from(await downloadResponse.arrayBuffer());
  const readbackSha256 = createHash("sha256").update(body).digest("hex");
  const returnedType = downloadResponse.headers.get("content-type") || "";
  expect(readbackSha256, "Reviewer case readback checksum").toBe(
    expected.sha256,
  );
  expect(body.length, "Reviewer case readback file_size").toBe(
    expected.fileSize,
  );
  expect(
    (returnedType.split(";")[0] || "").trim().toLowerCase(),
    `Reviewer case readback content_type exactly ${expected.contentType}`,
  ).toBe(expected.contentType);
  return {
    downloadStatus: downloadResponse.status,
    readbackSha256,
    readbackFileSize: body.length,
    readbackContentType: returnedType,
  };
}

const ROLE_SESSION_TOKEN_ENVS: Record<
  Exclude<OperationalProbeRole, "unauthenticated" | "invalid_session">,
  readonly string[]
> = {
  own_fleet: ["DRTS_OPERATIONAL_FLEET_SESSION_TOKEN"],
  platform_reviewer: [
    "DRTS_OPERATIONAL_PLATFORM_REVIEWER_SESSION_TOKEN",
    "DRTS_OPERATIONAL_PLATFORM_ADMIN_SESSION_TOKEN",
  ],
  foreign_fleet: [
    "DRTS_OPERATIONAL_FOREIGN_FLEET_SESSION_TOKEN",
    "DRTS_OPERATIONAL_OTHER_FLEET_SESSION_TOKEN",
  ],
  tenant_admin: ["DRTS_OPERATIONAL_TENANT_ADMIN_SESSION_TOKEN"],
  tenant_ops: ["DRTS_OPERATIONAL_TENANT_OPS_SESSION_TOKEN"],
  driver: ["DRTS_OPERATIONAL_DRIVER_SESSION_TOKEN"],
  ops_non_reviewer: ["DRTS_OPERATIONAL_OPS_NON_REVIEWER_SESSION_TOKEN"],
};

function resolveOperationalRoleSessionToken(
  role: Exclude<OperationalProbeRole, "unauthenticated" | "invalid_session">,
): string | undefined {
  if (role === "own_fleet" && verifiedFleetSessionToken) {
    return verifiedFleetSessionToken;
  }
  if (role === "platform_reviewer" && verifiedAdminSessionToken) {
    return verifiedAdminSessionToken;
  }
  for (const envName of ROLE_SESSION_TOKEN_ENVS[role]) {
    const value = process.env[envName]?.trim();
    if (value) return value;
  }
  return undefined;
}

export function operationalRoleRequestHeaders(
  role: OperationalProbeRole,
  baseUrlEnv: string,
  requestUrl: string,
  suppliedHeaders: Record<string, string> = {},
): Record<string, string> {
  const origin = new URL(requiredOrigin(baseUrlEnv)).origin;
  const target = new URL(requestUrl, origin);
  if (
    target.origin !== origin ||
    target.username ||
    target.password ||
    target.hash
  ) {
    throw new Error(
      "Operational role request requires its exact credential-free origin and no fragment",
    );
  }
  rejectSpoofedIdentityHeaders(suppliedHeaders);
  const headers = { ...suppliedHeaders };
  const setupIdToken = getIdentityToken(baseUrlEnv)?.trim();
  const isDirectApiOrigin =
    baseUrlEnv === "DRTS_OPERATIONAL_API_URL" ||
    baseUrlEnv === "DRTS_DEV_API_BASE_URL";

  if (role === "unauthenticated") {
    for (const name of Object.keys(headers)) {
      if (
        name.toLowerCase() === "x-drts-authorization" ||
        name.toLowerCase() === "authorization"
      ) {
        delete headers[name];
      }
    }
    if (setupIdToken && !isDirectApiOrigin) {
      headers["Authorization"] = `Bearer ${setupIdToken}`;
    }
    return headers;
  }

  if (role === "invalid_session") {
    for (const name of Object.keys(headers)) {
      if (
        name.toLowerCase() === "x-drts-authorization" ||
        name.toLowerCase() === "authorization"
      ) {
        delete headers[name];
      }
    }
    if (setupIdToken) {
      headers["Authorization"] = `Bearer ${setupIdToken}`;
      headers["x-drts-authorization"] =
        "Bearer invalid.operational.session.token";
    } else if (isDirectApiOrigin) {
      headers["Authorization"] = "Bearer invalid.operational.session.token";
    } else {
      headers["x-drts-authorization"] =
        "Bearer invalid.operational.session.token";
    }
    return headers;
  }

  const sessionToken = resolveOperationalRoleSessionToken(role);
  if (sessionToken && sessionToken === setupIdToken) {
    throw new Error(
      `Operational role ${role} session token must be distinct from Cloud Run invocation proof`,
    );
  }
  if (!sessionToken) {
    if (
      role === "platform_reviewer" &&
      (baseUrlEnv === "DRTS_OPERATIONAL_PLATFORM_ADMIN_URL" ||
        baseUrlEnv === "DRTS_DEV_PLATFORM_ADMIN_BASE_URL") &&
      setupIdToken
    ) {
      headers["Authorization"] = `Bearer ${setupIdToken}`;
      return headers;
    }
    throw new Error(
      `Operational role ${role} requires a verified backend session token (${ROLE_SESSION_TOKEN_ENVS[role].join(" or ")})`,
    );
  }

  if (setupIdToken) {
    headers["Authorization"] = `Bearer ${setupIdToken}`;
    headers["x-drts-authorization"] = `Bearer ${sessionToken}`;
  } else if (isDirectApiOrigin) {
    headers["Authorization"] = `Bearer ${sessionToken}`;
  } else {
    headers["x-drts-authorization"] = `Bearer ${sessionToken}`;
  }
  return headers;
}

export async function verifyOperationalRoleSession(
  role: Exclude<OperationalProbeRole, "unauthenticated" | "invalid_session">,
  baseUrlEnv: string,
  expectedOwnFleetId = "fleet-demo-001",
): Promise<Record<string, unknown>> {
  const origin = new URL(requiredOrigin(baseUrlEnv)).origin;
  const sessionPath =
    baseUrlEnv === "DRTS_OPERATIONAL_API_URL" ||
    baseUrlEnv === "DRTS_DEV_API_BASE_URL"
      ? "/api/auth/session"
      : "/control-plane-proxy/auth/session";
  const sessionUrl = new URL(sessionPath, origin).toString();
  const headers = operationalRoleRequestHeaders(role, baseUrlEnv, sessionUrl);
  const response = await fetch(sessionUrl, {
    method: "GET",
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  expect(
    response.status,
    `Role session verification for ${role} at ${sessionUrl}`,
  ).toBe(200);
  expectCandidateRevision(
    response.headers,
    `Role session verification for ${role} at ${sessionUrl}`,
  );
  const rawPayload = normalizeApiResponse(await response.json());
  const payload = objectValue(rawPayload);
  const data = objectValue(payload.data ?? payload);
  const identity = objectValue(data.identity);
  expect(
    data.active,
    `Role ${role} session must be active in /auth/session`,
  ).toBe(true);

  const realm = String(identity.realm ?? "");
  const actorType = String(identity.actorType ?? "");
  const partnerId = String(identity.partnerId ?? "");
  const roles = Array.isArray(identity.roles)
    ? identity.roles.map((r) => String(r))
    : [];

  if (role === "own_fleet") {
    expect(realm, "own_fleet session must be partner realm").toBe("partner");
    expect(partnerId, "own_fleet session must bind expectedOwnFleetId").toBe(
      expectedOwnFleetId,
    );
  } else if (role === "foreign_fleet") {
    expect(realm, "foreign_fleet session must be partner realm").toBe(
      "partner",
    );
    expect(partnerId, "foreign_fleet session must have partnerId").toBeTruthy();
    expect(
      partnerId !== expectedOwnFleetId,
      `foreign_fleet partnerId (${partnerId}) must differ from own fleet (${expectedOwnFleetId})`,
    ).toBe(true);
  } else if (role === "platform_reviewer") {
    expect(realm, "platform_reviewer session must be platform realm").toBe(
      "platform",
    );
    expect(
      actorType === "platform_admin" ||
        roles.includes("platform_reviewer") ||
        roles.includes("platform_admin") ||
        roles.includes("super_admin"),
      "platform_reviewer session must have platform reviewer/admin authority",
    ).toBe(true);
  } else if (role === "tenant_admin") {
    expect(realm, "tenant_admin session must be tenant realm").toBe("tenant");
    expect(
      actorType === "tenant_admin" || roles.includes("tenant_admin"),
      "tenant_admin session must carry tenant_admin role",
    ).toBe(true);
  } else if (role === "tenant_ops") {
    expect(realm, "tenant_ops session must be tenant realm").toBe("tenant");
    expect(
      roles.includes("tenant_ops") ||
        roles.includes("dispatcher") ||
        actorType === "tenant_ops",
      "tenant_ops session must carry tenant_ops/dispatcher role",
    ).toBe(true);
    expect(
      roles.includes("tenant_admin"),
      "tenant_ops session must not carry tenant_admin role",
    ).toBe(false);
  } else if (role === "driver") {
    expect(
      realm === "driver" || actorType === "driver" || roles.includes("driver"),
      "driver session must carry driver identity",
    ).toBe(true);
  } else if (role === "ops_non_reviewer") {
    expect(realm, "ops_non_reviewer session must be platform realm").toBe(
      "platform",
    );
    expect(
      roles.includes("platform_reviewer") ||
        roles.includes("platform_admin") ||
        roles.includes("super_admin") ||
        actorType === "platform_admin",
      "ops_non_reviewer session must not have platform_reviewer/platform_admin authority",
    ).toBe(false);
  }

  return identity;
}

export async function probeOperationalDocumentRoleAccess(
  probe: RoleAccessProbeSetup,
): Promise<{
  role: OperationalProbeRole;
  url: string;
  method: HttpMethod;
  status: number;
  errorCode?: string;
}> {
  const baseUrlEnv =
    probe.baseUrlEnv ??
    (process.env.DRTS_OPERATIONAL_FLEET_PARTNER_PORTAL_URL?.trim()
      ? "DRTS_OPERATIONAL_FLEET_PARTNER_PORTAL_URL"
      : "DRTS_DEV_FLEET_PARTNER_PORTAL_BASE_URL");
  const origin = new URL(requiredOrigin(baseUrlEnv)).origin;
  if (
    probe.verifySession !== false &&
    probe.role !== "unauthenticated" &&
    probe.role !== "invalid_session"
  ) {
    await verifyOperationalRoleSession(
      probe.role,
      baseUrlEnv,
      probe.expectedOwnFleetId ?? "fleet-demo-001",
    );
  }

  const parsedUrl = new URL(probe.path, origin);
  if (
    baseUrlEnv !== "DRTS_OPERATIONAL_API_URL" &&
    baseUrlEnv !== "DRTS_DEV_API_BASE_URL" &&
    parsedUrl.pathname.startsWith("/api/")
  ) {
    parsedUrl.pathname = parsedUrl.pathname.replace(
      /^\/api\//,
      "/control-plane-proxy/",
    );
  }
  const targetUrl = parsedUrl.toString();
  const headers = operationalRoleRequestHeaders(
    probe.role,
    baseUrlEnv,
    targetUrl,
    probe.headers,
  );

  let requestBody: BodyInit | undefined;
  if (probe.rawBodyContentType) {
    const fixture = getOperationalDocumentFixture(probe.rawBodyContentType);
    requestBody = new Uint8Array(fixture.bytes);
    headers["Content-Type"] = "application/octet-stream";
  } else if (probe.body !== undefined) {
    requestBody = JSON.stringify(probe.body);
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(targetUrl, {
    method: probe.method,
    headers,
    ...(requestBody !== undefined ? { body: requestBody } : {}),
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  expectCandidateRevision(
    response.headers,
    `Role access probe (${probe.role} ${probe.method} ${targetUrl})`,
  );

  const expectedStatuses = Array.isArray(probe.expectedStatus)
    ? probe.expectedStatus
    : [probe.expectedStatus];
  expect(
    expectedStatuses.includes(response.status),
    `Role access probe (${probe.role} ${probe.method} ${probe.path}) expected status ${expectedStatuses.join(" or ")}, got ${response.status}`,
  ).toBe(true);

  let errorCode: string | undefined;
  try {
    const parsed =
      typeof response.json === "function"
        ? ((await response.json()) as {
            error?: { code?: string };
            code?: string;
          })
        : null;
    errorCode = parsed?.error?.code ?? parsed?.code;
  } catch {
    // Binary or non-JSON response
  }

  if (probe.expectedErrorCode) {
    expect(
      errorCode,
      `Role access probe (${probe.role} ${probe.method} ${probe.path}) expected error code ${probe.expectedErrorCode}`,
    ).toBe(probe.expectedErrorCode);
  }

  return {
    role: probe.role,
    url: targetUrl,
    method: probe.method,
    status: response.status,
    ...(errorCode ? { errorCode } : {}),
  };
}

export async function resolveOperationalEditableCase(
  baseUrlEnv: string,
  expectedFleetPartnerId: string,
  periodMonths: string[] = ["2026-03", "2026-06"],
): Promise<{
  caseId: string;
  fleetPartnerId: string;
  status: string;
  responsibility: string;
  resolution: "existing" | "created_from_statement_dispute";
  statementId?: string;
}> {
  const origin = new URL(requiredOrigin(baseUrlEnv)).origin;
  const listUrl = new URL(
    "/control-plane-proxy/fleet-partner/cases",
    origin,
  ).toString();
  const listHeaders = operationalRequestHeaders(baseUrlEnv, listUrl);
  const listResponse = await fetch(listUrl, {
    method: "GET",
    headers: listHeaders,
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  expect(listResponse.status, `GET fleet cases ${listUrl}`).toBe(200);
  expectCandidateRevision(listResponse.headers, `GET fleet cases ${listUrl}`);
  const listData = (await listResponse.json()) as {
    data?: {
      cases?: Array<Record<string, unknown>>;
    };
  };
  const cases = Array.isArray(listData?.data?.cases) ? listData.data.cases : [];
  for (const item of cases) {
    const id = String(item.id ?? item.case_id ?? item.caseId ?? "").trim();
    const fleetId = String(
      item.fleet_partner_id ?? item.fleetPartnerId ?? "",
    ).trim();
    const status = String(item.status ?? "").trim();
    const responsibility = String(item.responsibility ?? "").trim();
    if (
      id &&
      fleetId === expectedFleetPartnerId &&
      status !== "closed" &&
      responsibility !== "platform"
    ) {
      return {
        caseId: id,
        fleetPartnerId: fleetId,
        status,
        responsibility,
        resolution: "existing",
      };
    }
  }

  for (const periodMonth of periodMonths) {
    const statementsUrl = new URL(
      `/control-plane-proxy/fleet-partner/statements?periodMonth=${encodeURIComponent(periodMonth)}`,
      origin,
    ).toString();
    const statementsHeaders = operationalRequestHeaders(
      baseUrlEnv,
      statementsUrl,
    );
    const statementsResponse = await fetch(statementsUrl, {
      method: "GET",
      headers: statementsHeaders,
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });
    expect(
      statementsResponse.status,
      `GET fleet statements ${statementsUrl}`,
    ).toBe(200);
    expectCandidateRevision(
      statementsResponse.headers,
      `GET fleet statements ${statementsUrl}`,
    );
    const statementsData = (await statementsResponse.json()) as {
      data?: {
        statements?: Array<Record<string, unknown>>;
      };
    };
    const statements = Array.isArray(statementsData?.data?.statements)
      ? statementsData.data.statements
      : [];
    const matchingStatement = statements.find((stmt) => {
      const stmtFleetId = String(
        stmt.fleet_partner_id ?? stmt.fleetPartnerId ?? expectedFleetPartnerId,
      ).trim();
      const stmtId = String(
        stmt.statement_id ?? stmt.statementId ?? stmt.id ?? "",
      ).trim();
      return Boolean(stmtId) && stmtFleetId === expectedFleetPartnerId;
    });
    if (!matchingStatement) continue;

    const statementId = String(
      matchingStatement.statement_id ??
        matchingStatement.statementId ??
        matchingStatement.id,
    ).trim();
    const disputeUrl = new URL(
      `/control-plane-proxy/fleet-partner/statements/${encodeURIComponent(statementId)}/dispute`,
      origin,
    ).toString();
    const disputeHeaders = operationalRequestHeaders(baseUrlEnv, disputeUrl, {
      "Content-Type": "application/json",
    });
    const disputeResponse = await fetch(disputeUrl, {
      method: "POST",
      headers: disputeHeaders,
      body: JSON.stringify({
        reason: "Operational C125 case attachment verification",
      }),
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });
    expect(
      [200, 201].includes(disputeResponse.status),
      `POST statement dispute ${disputeUrl} must succeed, got ${disputeResponse.status}`,
    ).toBe(true);
    expectCandidateRevision(
      disputeResponse.headers,
      `POST statement dispute ${disputeUrl}`,
    );
    const disputeData = (await disputeResponse.json()) as {
      data?: {
        dispute_case_id?: string;
        disputeCaseId?: string;
      };
    };
    const disputeCaseId = String(
      disputeData?.data?.dispute_case_id ??
        disputeData?.data?.disputeCaseId ??
        "",
    ).trim();
    expect(
      disputeCaseId,
      "statement dispute must return dispute_case_id",
    ).toBeTruthy();

    const detailUrl = new URL(
      `/control-plane-proxy/fleet-partner/cases/${encodeURIComponent(disputeCaseId)}`,
      origin,
    ).toString();
    const detailHeaders = operationalRequestHeaders(baseUrlEnv, detailUrl);
    const detailResponse = await fetch(detailUrl, {
      method: "GET",
      headers: detailHeaders,
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });
    expect(detailResponse.status, `GET created dispute case ${detailUrl}`).toBe(
      200,
    );
    expectCandidateRevision(
      detailResponse.headers,
      `GET created dispute case ${detailUrl}`,
    );
    const detailData = (await detailResponse.json()) as {
      data?: {
        case_detail?: Record<string, unknown>;
        caseDetail?: Record<string, unknown>;
      };
    };
    const caseDetail = objectValue(
      detailData?.data?.case_detail ??
        detailData?.data?.caseDetail ??
        detailData?.data,
    );
    const resolvedFleetId = String(
      caseDetail.fleet_partner_id ?? caseDetail.fleetPartnerId ?? "",
    ).trim();
    const resolvedStatus = String(caseDetail.status ?? "").trim();
    const resolvedResponsibility = String(
      caseDetail.responsibility ?? "",
    ).trim();
    expect(
      resolvedFleetId,
      "created dispute case fleet_partner_id must match expectedFleetPartnerId",
    ).toBe(expectedFleetPartnerId);
    expect(
      resolvedStatus !== "closed",
      "created dispute case must be open/editable",
    ).toBe(true);
    expect(
      resolvedResponsibility !== "platform",
      "created dispute case must be fleet-editable",
    ).toBe(true);
    return {
      caseId: disputeCaseId,
      fleetPartnerId: resolvedFleetId,
      status: resolvedStatus,
      responsibility: resolvedResponsibility,
      resolution: "created_from_statement_dispute",
      statementId,
    };
  }

  throw new Error(
    `Unable to resolve or create an open fleet-editable case associated with ${expectedFleetPartnerId}`,
  );
}

/** Preserve the existing request rail for other surfaces. Fleet application
 * proof stays exclusively in native I/O, outside Playwright's retained trace.
 */
export async function fetchOperationalSurface(
  request: APIRequestContext,
  baseUrlEnv: string,
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    data?: unknown;
  } = {},
): Promise<Pick<APIResponse, "status" | "url" | "headers" | "json" | "ok">> {
  const headers = operationalRequestHeaders(baseUrlEnv, url, options.headers);
  if (!isFleetOriginEnvironment(baseUrlEnv)) {
    return request.fetch(url, { ...options, headers, maxRedirects: 0 });
  }
  try {
    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers,
      ...(options.data !== undefined
        ? { body: JSON.stringify(options.data) }
        : {}),
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });
    return {
      status: () => response.status,
      url: () => url,
      headers: () => Object.fromEntries(response.headers.entries()),
      ok: () => response.status >= 200 && response.status < 300,
      json: async () => {
        try {
          return await response.json();
        } catch {
          throw new Error("Fleet operational response JSON invalid");
        }
      },
    };
  } catch {
    throw new Error("Fleet operational request transport failed");
  }
}

export async function installOperationalBrowserHeaders(
  page: Page,
  baseUrlEnv: string,
) {
  if (!isFleetOriginEnvironment(baseUrlEnv)) {
    const idToken = getIdentityToken(baseUrlEnv);
    if (idToken) {
      await page
        .context()
        .setExtraHTTPHeaders({ Authorization: `Bearer ${idToken}` });
    }
    return;
  }
  const origin = new URL(requiredOrigin(baseUrlEnv)).origin;
  // Fail before navigating or mutating when lawful application proof is absent.
  const proof = operationalRequestHeaders(baseUrlEnv, origin);
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (new URL(request.url()).origin !== origin) {
      await route.continue();
      return;
    }
    const headers = new Headers(request.headers());
    for (const [name, value] of Object.entries(
      operationalRequestHeaders(baseUrlEnv, request.url(), proof),
    )) {
      headers.set(name, value);
    }
    // Native fetch keeps application proof out of Playwright API request traces.
    // Do not follow redirects: the browser starts the next request without proof.
    try {
      const body = request.postDataBuffer();
      const response = await fetch(request.url(), {
        method: request.method(),
        headers,
        ...(body ? { body: new Uint8Array(body) } : {}),
        redirect: "manual",
        signal: AbortSignal.timeout(30_000),
      });
      const bytes = Buffer.from(await response.arrayBuffer());
      const responseHeaders = Object.fromEntries(response.headers.entries());
      // Native fetch has decoded the body. Preserve those bytes and let the
      // browser receive their actual length instead of compressed wire metadata.
      delete responseHeaders["content-encoding"];
      delete responseHeaders["content-length"];
      delete responseHeaders["transfer-encoding"];
      const cookies = response.headers.getSetCookie();
      if (cookies.length) responseHeaders["set-cookie"] = cookies.join("\n");
      await route.fulfill({
        status: response.status,
        headers: responseHeaders,
        body: bytes,
      });
    } catch {
      // Never forward transport errors that might include request credentials.
      throw new Error("Fleet operational browser transport failed");
    }
  });
}

export function valueAtPath(value: unknown, dotPath: string): unknown {
  return dotPath.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[key];
  }, value);
}

export function variableValue(name: string, variables: TemplateVariables) {
  const value = variables[name];
  expect(value, `template variable ${name}`).not.toBeUndefined();
  return value;
}

export function materializeString(
  template: string,
  variables: TemplateVariables,
) {
  return template.replace(/\{\{([a-zA-Z][a-zA-Z0-9_]*)\}\}/g, (_, name) =>
    String(variableValue(name, variables)),
  );
}

export function materializeValue(
  value: unknown,
  variables: TemplateVariables,
): unknown {
  if (typeof value === "string") {
    const wholeVariable = value.match(/^\{\{([a-zA-Z][a-zA-Z0-9_]*)\}\}$/);
    return wholeVariable
      ? variableValue(wholeVariable[1]!, variables)
      : materializeString(value, variables);
  }
  if (Array.isArray(value)) {
    return value.map((item) => materializeValue(item, variables));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        materializeValue(item, variables),
      ]),
    );
  }
  return value;
}

export interface SetupExecutorContext {
  request: APIRequestContext;
  record: (entry: Record<string, unknown>) => void;
}

export async function runSetup(
  context: SetupExecutorContext,
  journey: Journey,
  variables: TemplateVariables,
) {
  for (const setup of journey.setup ?? []) {
    const setupBaseUrlEnv = setup.baseUrlEnv ?? journey.baseUrlEnv;

    if (setup.kind === "fleet-editable-case") {
      const expectedFleetPartnerId = materializeString(
        setup.expectedFleetPartnerId,
        variables,
      );
      const resolved = await resolveOperationalEditableCase(
        setupBaseUrlEnv,
        expectedFleetPartnerId,
        setup.periodMonths,
      );
      if (setup.capture) {
        for (const [name, valuePath] of Object.entries(setup.capture)) {
          const value =
            valueAtPath(resolved, valuePath) ??
            valueAtPath({ data: resolved }, valuePath);
          expect(
            value,
            `${journey.id} setup fleet-editable-case capture ${name}`,
          ).toBeTruthy();
          variables[name] = value;
        }
      }
      context.record({
        kind: "setup-fleet-editable-case",
        journey: journey.id,
        surface: journey.surface,
        actorScope: journey.actorScope,
        caseId: resolved.caseId,
        fleetPartnerId: resolved.fleetPartnerId,
        status: resolved.status,
        responsibility: resolved.responsibility,
        resolution: resolved.resolution,
        ...(resolved.statementId ? { statementId: resolved.statementId } : {}),
      });
      continue;
    }

    if (setup.kind === "role-access-probe") {
      const materializedProbe: RoleAccessProbeSetup = {
        ...setup,
        baseUrlEnv: setupBaseUrlEnv,
        path: materializeString(setup.path, variables),
        ...(setup.body !== undefined
          ? { body: materializeValue(setup.body, variables) }
          : {}),
        ...(setup.headers
          ? {
              headers: materializeValue(setup.headers, variables) as Record<
                string,
                string
              >,
            }
          : {}),
        ...(setup.expectedOwnFleetId
          ? {
              expectedOwnFleetId: materializeString(
                setup.expectedOwnFleetId,
                variables,
              ),
            }
          : {}),
      };
      const probeResult =
        await probeOperationalDocumentRoleAccess(materializedProbe);
      context.record({
        kind: "setup-role-access-probe",
        journey: journey.id,
        surface: journey.surface,
        actorScope: journey.actorScope,
        role: probeResult.role,
        method: probeResult.method,
        url: probeResult.url,
        status: probeResult.status,
        ...(probeResult.errorCode ? { errorCode: probeResult.errorCode } : {}),
      });
      continue;
    }

    const origin = requiredOrigin(setupBaseUrlEnv);
    const rawHeaders = setup.headers
      ? (materializeValue(setup.headers, variables) as Record<string, string>)
      : undefined;
    const headers = operationalRequestHeaders(
      setupBaseUrlEnv,
      origin,
      rawHeaders,
    );

    if (setup.kind === "document-upload") {
      const intentPath = materializeString(setup.intentPath, variables);
      const confirmPath = materializeString(setup.confirmPath, variables);
      const intentBody = materializeValue(
        setup.intentBody,
        variables,
      ) as Record<string, unknown>;
      const confirmBody = materializeValue(
        setup.confirmBody,
        variables,
      ) as Record<string, unknown>;

      const evidence = await uploadOperationalDocument(
        context.request,
        origin,
        intentPath,
        intentBody,
        confirmPath,
        confirmBody,
        headers,
      );

      if (setup.reviewerBaseUrlEnv) {
        const reviewerOrigin = requiredOrigin(setup.reviewerBaseUrlEnv);
        const fixture = getOperationalDocumentFixture(
          intentBody.contentType ?? confirmBody.contentType,
        );
        const reviewerResult = await downloadOperationalDocumentAsReviewer(
          reviewerOrigin,
          setup.reviewerBaseUrlEnv,
          evidence.confirmCaseId && evidence.attachmentId
            ? {
                kind: "case",
                caseId: evidence.confirmCaseId,
                attachmentId: evidence.attachmentId,
              }
            : {
                kind: "supply",
                submissionId: evidence.confirmSubmissionId!,
                documentId: evidence.documentId!,
              },
          {
            sha256: evidence.sha256,
            fileSize: evidence.fileSize,
            contentType: fixture.contentType,
          },
        );
        evidence.reviewerDownloadStatus = reviewerResult.downloadStatus;
        evidence.reviewerReadbackSha256 = reviewerResult.readbackSha256;
        evidence.reviewerReadbackFileSize = reviewerResult.readbackFileSize;
        evidence.reviewerReadbackContentType =
          reviewerResult.readbackContentType;
      }

      if (setup.capture) {
        for (const [name, valuePath] of Object.entries(setup.capture)) {
          const value =
            valueAtPath(evidence, valuePath) ??
            valueAtPath({ data: evidence }, valuePath);
          expect(
            value,
            `${journey.id} setup document-upload capture ${name}`,
          ).toBeTruthy();
          variables[name] = value;
        }
      }

      context.record({
        kind: "setup-document-upload",
        journey: journey.id,
        surface: journey.surface,
        actorScope: journey.actorScope,
        intentUrl: new URL(intentPath, origin).toString(),
        confirmUrl: new URL(confirmPath, origin).toString(),
        documentId: evidence.documentId,
        ...(evidence.attachmentId
          ? { attachmentId: evidence.attachmentId }
          : {}),
        objectKey: evidence.objectKey,
        fileSize: evidence.fileSize,
        sha256: evidence.sha256,
        attempts: {
          intent: evidence.intentAttempts,
          put: evidence.putAttempts,
          confirm: evidence.confirmAttempts,
          download: evidence.downloadAttempts,
        },
        intentStatus: evidence.intentStatus,
        putStatus: evidence.putStatus,
        putScanState: evidence.putScanState,
        confirmStatus: evidence.confirmStatus,
        confirmSubmissionId: evidence.confirmSubmissionId,
        ...(evidence.confirmCaseId
          ? { confirmCaseId: evidence.confirmCaseId }
          : {}),
        confirmFleetPartnerId: evidence.confirmFleetPartnerId,
        confirmDocumentType: evidence.confirmDocumentType,
        ...(evidence.confirmAttachmentState
          ? { confirmAttachmentState: evidence.confirmAttachmentState }
          : {}),
        ...(evidence.canonicalReadbackStatus
          ? { canonicalReadbackStatus: evidence.canonicalReadbackStatus }
          : {}),
        ...(evidence.readUrlStatus
          ? { readUrlStatus: evidence.readUrlStatus }
          : {}),
        ...(evidence.signedDownloadUrl
          ? { signedDownloadUrl: evidence.signedDownloadUrl }
          : {}),
        downloadStatus: evidence.downloadStatus,
        readbackSha256: evidence.readbackSha256,
        readbackFileSize: evidence.readbackFileSize,
        readbackContentType: evidence.readbackContentType,
        ...(evidence.reviewerDownloadStatus
          ? {
              reviewerDownloadStatus: evidence.reviewerDownloadStatus,
              reviewerReadbackSha256: evidence.reviewerReadbackSha256,
              reviewerReadbackFileSize: evidence.reviewerReadbackFileSize,
              reviewerReadbackContentType: evidence.reviewerReadbackContentType,
            }
          : {}),
        transientHistory: evidence.transientHistory,
      });
      continue;
    }

    const body = setup.body
      ? materializeValue(setup.body, variables)
      : undefined;

    const setupUrl = new URL(
      materializeString(setup.path, variables),
      origin,
    ).toString();
    const requestHeaders = operationalRequestHeaders(
      setupBaseUrlEnv,
      setupUrl,
      headers,
    );
    const response = await fetchOperationalSurface(
      context.request,
      setupBaseUrlEnv,
      setupUrl,
      {
        method: setup.method,
        ...(body
          ? {
              data: body,
              headers: {
                "Content-Type": "application/json",
                ...requestHeaders,
              },
            }
          : Object.keys(requestHeaders).length > 0
            ? { headers: requestHeaders }
            : {}),
      },
    );
    const responseStatus = response.status();
    const responseUrl = response.url();
    const responseHeaders = response.headers();
    const responseBody = await response.json().catch(() => null);

    expect(responseStatus, `${journey.id} setup ${setup.path}`).toBeLessThan(
      400,
    );
    expectCandidateRevision(
      responseHeaders,
      `${journey.id} setup ${setup.path}`,
    );
    if (setup.capture) {
      for (const [name, valuePath] of Object.entries(setup.capture)) {
        const value = valueAtPath(responseBody, valuePath);
        expect(
          value,
          `${journey.id} setup ${setup.path} capture ${name}`,
        ).toBeTruthy();
        variables[name] = value;
      }
    }
    context.record({
      kind: "setup",
      journey: journey.id,
      surface: journey.surface,
      actorScope: journey.actorScope,
      method: setup.method,
      url: responseUrl,
      status: responseStatus,
      captures: setup.capture ? Object.keys(setup.capture) : [],
    });
  }
}

export async function runOperationalDocumentAcceptance(
  context: SetupExecutorContext,
  acceptance: DocumentAcceptanceManifest,
  variables: TemplateVariables,
) {
  await runSetup(
    context,
    {
      id: acceptance.id,
      surface: acceptance.surface,
      baseUrlEnv: acceptance.baseUrlEnv,
      route: "/cases",
      actorScope: acceptance.actorScope,
      setup: acceptance.setup,
    },
    variables,
  );
}
