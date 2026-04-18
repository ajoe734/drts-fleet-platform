import { describe, expect, it } from "vitest";

import {
  appendProofPhotos,
  estimateBase64DecodedBytes,
  getCompletionProofRequirements,
  getUnsupportedProofRequirementMessages,
  MAX_COMPLETION_PROOF_PHOTO_BYTES,
  MAX_COMPLETION_PROOF_PHOTOS,
  type ProofPhoto,
} from "../../apps/driver-app/lib/completion-proof";

describe("driver-app completion proof helpers", () => {
  it("estimates decoded base64 size", () => {
    expect(estimateBase64DecodedBytes("TWE=")).toBe(2);
    expect(estimateBase64DecodedBytes("TWFu")).toBe(3);
  });

  it("accepts valid photos and rejects oversized or missing base64 assets", () => {
    const validBase64 = Buffer.from("proof").toString("base64");
    const oversizedBase64 = Buffer.alloc(
      MAX_COMPLETION_PROOF_PHOTO_BYTES + 1,
      1,
    ).toString("base64");

    const result = appendProofPhotos(
      [],
      [
        {
          uri: "file://proof-ok.jpg",
          base64: validBase64,
          width: 100,
          height: 100,
          fileName: "proof-ok.jpg",
        },
        {
          uri: "file://proof-too-large.jpg",
          base64: oversizedBase64,
          width: 100,
          height: 100,
          fileName: "proof-too-large.jpg",
        },
        {
          uri: "file://proof-missing.jpg",
          base64: null,
          width: 100,
          height: 100,
          fileName: "proof-missing.jpg",
        },
      ],
    );

    expect(result.photos).toHaveLength(1);
    expect(result.photos[0]?.base64).toBe(validBase64);
    expect(result.rejected).toEqual([
      "proof-too-large.jpg is larger than 600KB after compression.",
      "proof-missing.jpg could not be converted to base64.",
    ]);
  });

  it("caps proof attachments at five photos", () => {
    const existing: ProofPhoto[] = Array.from(
      { length: MAX_COMPLETION_PROOF_PHOTOS },
      (_, i) => ({
        uri: `file://existing-${i}.jpg`,
        base64: Buffer.from(`existing-${i}`).toString("base64"),
        width: 100,
        height: 100,
        fileName: `existing-${i}.jpg`,
        estimatedBytes: 10,
      }),
    );

    const result = appendProofPhotos(existing, [
      {
        uri: "file://extra.jpg",
        base64: Buffer.from("extra").toString("base64"),
        width: 100,
        height: 100,
        fileName: "extra.jpg",
      },
    ]);

    expect(result.photos).toHaveLength(MAX_COMPLETION_PROOF_PHOTOS);
    expect(result.rejected).toEqual(["Only 5 proof photos can be attached."]);
  });

  it("summarizes completion proof requirements from the order", () => {
    const order = {
      proofRequirements: {
        minPhotoCount: 2,
        signoffRequired: true,
        expenseProofRequired: true,
      },
    };

    expect(getCompletionProofRequirements(order as never)).toEqual({
      minPhotoCount: 2,
      signoffRequired: true,
      expenseProofRequired: true,
    });
    expect(getUnsupportedProofRequirementMessages(order as never)).toEqual([
      "This trip also requires signoff proof, which is not supported in the driver app yet.",
      "This trip also requires expense proof, which is not supported in the driver app yet.",
    ]);
  });
});
