import { describe, expect, it } from "vitest";

import {
  sanitizeLine,
  summarizeLog,
  summarizeReport,
} from "../../e2e/agency-portal-business/failure-summary";

const JWT =
  "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZ2VuY3kifQ.c2lnbmF0dXJlLXZhbHVlLWZvci10ZXN0";

describe("four-portal journey failure summary", () => {
  it("keeps what failed and drops the credentials around it", () => {
    const line = sanitizeLine(
      "\u001b[31mTimeoutError: page.goto: Timeout 30000ms exceeded navigating to " +
        "http://localhost:3212/invite?token=inv_9f8e7d6c5b4a39281706f5e4d3c2b1a0 " +
        "as agency.pwd.1a2b3c4d@bureau-hosted.example with AgencyInit!1a2b3c4d#2026Valid " +
        `bearer ${JWT} reset {"token":"pwr_AbCdEfGhIjKlMnOpQrStUv"}\u001b[39m`,
    );

    expect(line).toContain("TimeoutError: page.goto: Timeout 30000ms exceeded");
    expect(line).toContain("http://localhost:3212/invite?[REDACTED]");
    for (const secret of [
      "inv_9f8e7d6c5b4a39281706f5e4d3c2b1a0",
      "agency.pwd.1a2b3c4d@bureau-hosted.example",
      "AgencyInit!1a2b3c4d#2026Valid",
      JWT,
      "pwr_AbCdEfGhIjKlMnOpQrStUv",
      "\u001b[",
    ]) {
      expect(line).not.toContain(secret);
    }
  });

  it("names the spec position and the result of each failed attempt", () => {
    const lines = summarizeReport({
      suites: [
        {
          suites: [
            {
              specs: [
                {
                  tests: [
                    {
                      results: [
                        {
                          status: "timedOut",
                          duration: 540_000,
                          errors: [
                            {
                              message:
                                "Test timeout of 540000ms exceeded.\nCall log: secret details",
                              location: {
                                file: "/home/runner/work/x/tests/e2e/agency-portal-business/four-portal-password-journey.spec.ts",
                                line: 109,
                                column: 10,
                              },
                            },
                          ],
                        },
                        { status: "passed", duration: 1 },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(lines).toEqual([
      "result: timedOut after 540s",
      "error: Test timeout of 540000ms exceeded. @ four-portal-password-journey.spec.ts:109",
    ]);
  });

  it("reports web servers or the browser going away, once each", () => {
    const lines = summarizeLog(
      [
        "[WebServer] ready on http://127.0.0.1:3212",
        "[WebServer] <--- Last few GCs --->",
        "[WebServer] FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory",
        "Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3212/login?next=%2Faccount",
        "Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3212/login?next=%2Faccount",
        "filled password AgencyReset!1a2b3c4d#2026Next",
      ].join("\n"),
    );

    expect(lines).toEqual([
      "log: [WebServer] FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory",
      "log: Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3212/login?[REDACTED]",
    ]);
  });
});
