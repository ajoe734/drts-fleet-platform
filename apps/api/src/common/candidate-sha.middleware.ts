import { Injectable, NestMiddleware } from "@nestjs/common";

export function getCandidateSha(env: NodeJS.ProcessEnv = process.env): string {
  // A response must never imply that a mutable branch is a deploy candidate.
  // Deploy - Dev injects this value from the checked-out, full object SHA.
  return env.DRTS_CANDIDATE_SHA?.trim() || "unconfigured";
}

@Injectable()
export class CandidateShaMiddleware implements NestMiddleware {
  use(
    _req: unknown,
    res: { setHeader: (key: string, value: string) => void },
    next: () => void,
  ) {
    res.setHeader("x-drts-candidate-sha", getCandidateSha());
    next();
  }
}
