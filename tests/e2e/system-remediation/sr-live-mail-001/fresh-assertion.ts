/** Mint through IAM with the runner's original WIF federated token, as auth@v2
 * does (its auth_token output). No service-account self-impersonation grant.
 * Decoded claims are used only to ensure uniqueness; auth/token verifies trust.
 */
export class FreshAssertionSource {
  private lastIat = -1;

  constructor(
    private readonly mint: () => Promise<string>,
    private readonly audience: string,
    private readonly wait = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms)),
  ) {}

  async next(): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt++) {
      if (this.lastIat >= 0 || attempt) await this.wait(1_100);
      const token = await this.mint();
      let claims: { iat?: number; aud?: string };
      try {
        claims = JSON.parse(
          Buffer.from(token.split(".")[1]!, "base64url").toString(),
        );
      } catch {
        throw new Error("Malformed Google assertion; contents withheld");
      }
      if (!Number.isSafeInteger(claims.iat) || claims.aud !== this.audience)
        throw new Error("Invalid assertion audience or issuance time");
      if (claims.iat! <= this.lastIat) continue;
      this.lastIat = claims.iat!;
      return token;
    }
    throw new Error("Google did not issue an assertion with a distinct iat");
  }
}

export function googleAssertionSource(
  audience: string,
  serviceAccount: string,
  federatedToken: string,
  mask: (value: string) => void,
) {
  if (
    !/^[a-z0-9-]+@drts-dev-devcc-20260825\.iam\.gserviceaccount\.com$/.test(
      serviceAccount,
    )
  )
    throw new Error("WIF service account is outside the authorized project");
  if (!federatedToken || /\s/.test(federatedToken))
    throw new Error("WIF federated token missing");
  mask(federatedToken);
  return new FreshAssertionSource(async () => {
    const response = await fetch(
      `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(serviceAccount)}:generateIdToken`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${federatedToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ audience, includeEmail: true }),
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok)
      throw new Error(`Google assertion mint returned HTTP ${response.status}`);
    const data = (await response.json()) as { token?: string };
    if (!data.token || /\s/.test(data.token))
      throw new Error("Google assertion absent");
    mask(data.token);
    return data.token;
  }, audience);
}
