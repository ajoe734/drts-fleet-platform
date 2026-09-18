import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { required, withTenantAcceptance } from "./acceptance-context";

interface ReceivedMessage {
  ID: string;
  To: { Address: string }[];
  Text: string;
}
test("Tenant invitations use actual SMTP receiver, one-time acceptance and revocation", async ({
  playwright,
}, testInfo) => {
  await withTenantAcceptance(playwright, testInfo, async (ctx) => {
    const mailboxOrigin = new URL(required("DRTS_UAT_MAILPIT_URL")).origin;
    const receive = async (email: string, excluded: string[] = []) => {
      let id: string | undefined;
      await expect
        .poll(
          async () => {
            const response = await ctx.client.get(
              `${mailboxOrigin}/api/v1/messages`,
            );
            expect(response.status()).toBe(200);
            const body = (await response.json()) as {
              messages: ReceivedMessage[];
            };
            id = body.messages.find(
              (message) =>
                !excluded.includes(message.ID) &&
                message.To.some(
                  (recipient) => recipient.Address.toLowerCase() === email,
                ),
            )?.ID;
            return Boolean(id);
          },
          { timeout: 15_000 },
        )
        .toBe(true);
      const response = await ctx.client.get(
        `${mailboxOrigin}/api/v1/message/${encodeURIComponent(id!)}`,
      );
      expect(response.status()).toBe(200);
      const message = (await response.json()) as ReceivedMessage;
      expect(
        message.To.some(
          (recipient) => recipient.Address.toLowerCase() === email,
        ),
      ).toBe(true);
      const invitationToken = message.Text.match(/\bti_[A-Za-z0-9_-]+/)?.[0];
      // The raw token and mail body are consumed in memory, never attached or logged.
      if (!invitationToken)
        throw new Error("Actual SMTP message has no invitation token");
      ctx.evidence.recordResourceId("mailpit_received_message", message.ID);
      return { id: message.ID, invitationToken };
    };
    const email = `invite-${randomUUID()}@qa-tenant-uat.example`;
    const command = {
      email,
      displayName: "QA invited user",
      roleCode: "tenant_viewer",
    };
    await ctx.negative("tenant/users", "readonlyA", "POST", command, 403);
    const user = await ctx.data<{ userId: string }>(
      "tenant/users",
      "adminA",
      "POST",
      command,
    );
    const first = await receive(email);
    const invitationPath = `tenant/users/${user.userId}/invitation`;
    await ctx.negative(
      `${invitationPath}/resend`,
      "adminB",
      "POST",
      {},
      404,
      "TENANT_USER_NOT_FOUND",
    );
    await ctx.data(`${invitationPath}/resend`, "adminA", "POST", {});
    const second = await receive(email, [first.id]);
    expect(second.invitationToken === first.invitationToken).toBe(false);
    await ctx.negative(
      "tenant/invitations/accept",
      "adminA",
      "POST",
      { invitationToken: first.invitationToken },
      403,
      "TENANT_INVITATION_ACCEPTANCE_DENIED",
    );
    await ctx.data("tenant/invitations/accept", "adminA", "POST", {
      invitationToken: second.invitationToken,
    });
    await ctx.negative(
      "tenant/invitations/accept",
      "adminA",
      "POST",
      { invitationToken: second.invitationToken },
      403,
      "TENANT_INVITATION_ACCEPTANCE_DENIED",
    );
    await ctx.checkpoint({
      apiPath: "tenant/users",
      actor: "adminA",
      selector: { key: "userId", value: user.userId },
      expected: {
        userId: user.userId,
        tenantId: ctx.tenantA,
        status: "active",
        roleCode: "tenant_viewer",
      },
      sql: "SELECT record FROM admin.phase1_tenant_user_roles WHERE tenant_id=$1 AND user_id=$2",
      parameters: [ctx.tenantA, user.userId],
    });
    const revokedEmail = `revoke-${randomUUID()}@qa-tenant-uat.example`;
    const revokedUser = await ctx.data<{ userId: string }>(
      "tenant/users",
      "adminA",
      "POST",
      { ...command, email: revokedEmail },
    );
    const revokedMail = await receive(revokedEmail);
    await ctx.data(
      `tenant/users/${revokedUser.userId}/invitation/revoke`,
      "adminA",
      "POST",
      {},
    );
    await ctx.negative(
      "tenant/invitations/accept",
      "adminA",
      "POST",
      { invitationToken: revokedMail.invitationToken },
      403,
      "TENANT_INVITATION_ACCEPTANCE_DENIED",
    );
    ctx.evidence.recordResourceId("accepted_tenant_user", user.userId);
    ctx.evidence.recordResourceId(
      "revoked_invitation_tenant_user",
      revokedUser.userId,
    );
  });
});
