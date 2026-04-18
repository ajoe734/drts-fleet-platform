import type { OwnedOrderRecord } from "@drts/contracts";

export const MAX_COMPLETION_PROOF_PHOTOS = 5;
export const MAX_COMPLETION_PROOF_PHOTO_BYTES = 600 * 1024;

export interface ProofPhotoCandidate {
  uri: string;
  base64?: string | null;
  width: number;
  height: number;
  fileName?: string | null;
}

export interface ProofPhoto {
  uri: string;
  base64: string;
  width: number;
  height: number;
  fileName?: string | null;
  estimatedBytes: number;
}

export interface ProofPhotoAppendResult {
  photos: ProofPhoto[];
  rejected: string[];
}

export interface CompletionProofRequirements {
  minPhotoCount: number;
  signoffRequired: boolean;
  expenseProofRequired: boolean;
}

export function estimateBase64DecodedBytes(base64: string): number {
  const normalized = base64.trim();
  if (normalized.length === 0) {
    return 0;
  }

  const padding = normalized.endsWith("==")
    ? 2
    : normalized.endsWith("=")
      ? 1
      : 0;

  return Math.floor((normalized.length * 3) / 4) - padding;
}

export function appendProofPhotos(
  existing: ProofPhoto[],
  candidates: ProofPhotoCandidate[],
): ProofPhotoAppendResult {
  const photos = [...existing];
  const rejected: string[] = [];

  for (const candidate of candidates) {
    if (photos.length >= MAX_COMPLETION_PROOF_PHOTOS) {
      rejected.push(
        `Only ${MAX_COMPLETION_PROOF_PHOTOS} proof photos can be attached.`,
      );
      break;
    }

    if (!candidate.base64) {
      rejected.push(
        `${candidate.fileName ?? candidate.uri} could not be converted to base64.`,
      );
      continue;
    }

    const estimatedBytes = estimateBase64DecodedBytes(candidate.base64);
    if (estimatedBytes > MAX_COMPLETION_PROOF_PHOTO_BYTES) {
      rejected.push(
        `${candidate.fileName ?? candidate.uri} is larger than 600KB after compression.`,
      );
      continue;
    }

    photos.push({
      uri: candidate.uri,
      base64: candidate.base64,
      width: candidate.width,
      height: candidate.height,
      fileName: candidate.fileName ?? null,
      estimatedBytes,
    });
  }

  return { photos, rejected };
}

export function getCompletionProofRequirements(
  order: OwnedOrderRecord | null,
): CompletionProofRequirements {
  return {
    minPhotoCount: order?.proofRequirements.minPhotoCount ?? 0,
    signoffRequired: order?.proofRequirements.signoffRequired ?? false,
    expenseProofRequired:
      order?.proofRequirements.expenseProofRequired ?? false,
  };
}

export function getUnsupportedProofRequirementMessages(
  order: OwnedOrderRecord | null,
): string[] {
  const requirements = getCompletionProofRequirements(order);
  const messages: string[] = [];

  if (requirements.signoffRequired) {
    messages.push(
      "This trip also requires signoff proof, which is not supported in the driver app yet.",
    );
  }

  if (requirements.expenseProofRequired) {
    messages.push(
      "This trip also requires expense proof, which is not supported in the driver app yet.",
    );
  }

  return messages;
}
