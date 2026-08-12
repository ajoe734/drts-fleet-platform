import { Injectable, NestMiddleware } from "@nestjs/common";

export function getCandidateSha(env: NodeJS.ProcessEnv = process.env): string {
  const sha =
    env.DRTS_CANDIDATE_SHA ||
    env.NEXT_PUBLIC_DRTS_CANDIDATE_SHA ||
    env.COMMIT_SHA ||
    env.VERCEL_GIT_COMMIT_SHA ||
    env.GITHUB_SHA ||
    "dev";
  return sha.trim();
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
