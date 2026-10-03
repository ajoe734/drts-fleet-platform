import {
  Controller,
  Get,
  Header,
  Param,
  Query,
  StreamableFile,
} from "@nestjs/common";

import { OpenRoute } from "../../common/auth";
import { RemittanceProofService } from "./remittance-proof.service";

/** Bearer URL: signature + expiry + current proof/hash/scan checks authorize bytes. */
@Controller("reimbursements/proof-downloads/remittance-proof")
export class RemittanceProofDownloadController {
  constructor(private readonly proofs: RemittanceProofService) {}

  @Get(":proofId")
  @OpenRoute()
  @Header("Cache-Control", "private, no-store")
  @Header("X-Content-Type-Options", "nosniff")
  @Header("Referrer-Policy", "no-referrer")
  async download(
    @Param("proofId") proofId: string,
    @Query() query: Record<string, unknown>,
  ) {
    const text = (key: string) =>
      typeof query[key] === "string" ? (query[key] as string) : "";
    const content = await this.proofs.readContent({
      proofId,
      contentHash: text("manifest_hash"),
      signedAt: text("signed_at"),
      expiresAt: text("expires_at"),
      keyId: text("key_id"),
      signature: text("sig"),
      signatureVersion: Number(text("sig_v")),
    });
    return new StreamableFile(content.bytes, {
      type: content.contentType,
      length: content.bytes.length,
      // Never render uploaded content inline or echo a user-controlled filename.
      disposition: 'attachment; filename="remittance-proof"',
    });
  }
}
