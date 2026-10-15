import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

type Role = "pax" | "ops" | "driver";
type Stage = { name: string; state: "started" | "passed" | "failed" };

/** Persist before every phase, so a hosted job cancellation still leaves its
 * last operation. Never accept response bodies, credentials or error text.
 */
export function createJourneyProgress(file: string) {
  const stages: Stage[] = [];
  const responses: {
    role: Role;
    method: string;
    path: string;
    status: number;
  }[] = [];
  mkdirSync(dirname(file), { recursive: true });
  const save = () =>
    writeFileSync(file, JSON.stringify({ stages, responses }, null, 2));
  save();
  return {
    async step<T>(name: string, operation: () => Promise<T>): Promise<T> {
      const stage: Stage = { name, state: "started" };
      stages.push(stage);
      save();
      console.log(`[shared-order] ${name}: started`);
      try {
        const result = await operation();
        stage.state = "passed";
        return result;
      } catch (error) {
        stage.state = "failed";
        throw error;
      } finally {
        save();
        console.log(`[shared-order] ${name}: ${stage.state}`);
      }
    },
    response(role: Role, method: string, url: string, status: number) {
      const path = new URL(url).pathname;
      if (
        !/\/(?:rides|orders|dispatch|driver\/(?:tasks|task-views)|review-demo)(?:\/|$)|\/auth\/driver\/device\/(?:invite|register)$/.test(
          path,
        )
      )
        return;
      responses.push({ role, method, path, status });
      save();
    },
  };
}
