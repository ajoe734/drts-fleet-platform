import { describe, expect, it, vi, beforeEach } from "vitest";
import { PassengerAccountService } from "../../../apps/api/src/modules/passenger-app/account/passenger-account.service";

describe("PassengerAccountService", () => {
  let service: PassengerAccountService;
  let mockDb: any;
  let mockJwt: any;
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    mockDb = {
      connect: vi.fn().mockResolvedValue(mockClient),
      query: vi.fn(),
    };
    mockJwt = {
      issueSessionToken: vi.fn().mockResolvedValue({
        token: "access_token",
        sessionId: "mock_iam_session",
      }),
      revokeCurrentSession: vi.fn().mockResolvedValue({}),
      revokeAllSessionsForPrincipal: vi.fn().mockResolvedValue({}),
    };
    service = new PassengerAccountService(mockDb, mockJwt);
  });

  it("should issue a session with 15m expiration", async () => {
    mockDb.query.mockResolvedValueOnce({ rowCount: 1 });
    const res = await service.issueSession("drts-1", "login");

    expect(mockJwt.issueSessionToken).toHaveBeenCalledWith(expect.anything(), {
      expiresIn: "15m",
    });
    expect(res.accessToken).toBe("access_token");
    expect(res.refreshToken).toBeDefined();

    // Check that it hashed the token
    const callArgs = mockDb.query.mock.calls[0];
    expect(callArgs[0]).toContain("INSERT INTO passenger.passenger_sessions");
    expect(callArgs[1][3]).not.toBe(res.refreshToken); // the plain token is NOT what is inserted
  });

  it("should revoke the entire family when a revoked refresh token is reused", async () => {
    // mock session as already revoked
    mockClient.query.mockResolvedValueOnce(); // BEGIN
    mockClient.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          id: "sess-1",
          family_id: "fam-1",
          is_revoked: true,
          expires_at: new Date(Date.now() + 10000),
        },
      ],
    }); // SELECT FOR UPDATE
    mockClient.query.mockResolvedValueOnce(); // ROLLBACK

    mockDb.query.mockResolvedValueOnce({
      rows: [{ iam_session_id: "iam-1" }],
    }); // SELECT iam_session_id

    await expect(service.refreshSession("compromised_token")).rejects.toThrow(
      "invalid_grant",
    );

    expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");

    // Expect family revocation update
    const updateCalls = mockDb.query.mock.calls.filter((c: any) =>
      c[0].includes(
        "UPDATE passenger.passenger_sessions SET is_revoked = true WHERE family_id",
      ),
    );
    expect(updateCalls.length).toBe(1);
    expect(updateCalls[0][1]).toEqual(["fam-1"]);

    expect(mockJwt.revokeCurrentSession).toHaveBeenCalledWith("iam-1");
  });

  it("logoutAll should revoke all IAM sessions", async () => {
    mockDb.query.mockResolvedValueOnce({ rowCount: 1 });
    await service.logoutAll("drts-1");
    expect(mockJwt.revokeAllSessionsForPrincipal).toHaveBeenCalledWith(
      "drts-1",
    );
  });

  it("deleteAccount should revoke all IAM sessions and anonymize", async () => {
    mockClient.query.mockResolvedValueOnce(); // BEGIN
    mockClient.query.mockResolvedValueOnce(); // UPDATE accounts
    mockClient.query.mockResolvedValueOnce(); // UPDATE sessions
    mockClient.query.mockResolvedValueOnce(); // DELETE identities
    mockClient.query.mockResolvedValueOnce(); // COMMIT

    await service.deleteAccount("drts-1");

    expect(mockJwt.revokeAllSessionsForPrincipal).toHaveBeenCalledWith(
      "drts-1",
    );
  });
});
