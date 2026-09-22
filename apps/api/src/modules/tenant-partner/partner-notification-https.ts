import { lookup } from "node:dns";
import { request } from "node:https";
import { BlockList, isIP } from "node:net";
import { PARTNER_NOTIFICATION_MAX_ACK_BODY_BYTES } from "@drts/contracts";
import type { WebhookFetch } from "./webhook-dispatch.service";

const blocked = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked.addSubnet(address, prefix, "ipv4");
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
for (const [address, prefix] of [
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
] as const)
  blocked.addSubnet(address, prefix, "ipv6");

export function isPublicPartnerAddress(address: string): boolean {
  const family = isIP(address);
  return family === 4
    ? !blocked.check(address, "ipv4")
    : family === 6 &&
        globalV6.check(address, "ipv6") &&
        !blocked.check(address, "ipv6");
}

/** HTTPS only. DNS is checked at socket lookup, so validation cannot race a second DNS resolution. */
export const partnerNotificationHttpsFetch: WebhookFetch = async (
  input,
  init,
) => {
  const url = new URL(input);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (isIP(host) && !isPublicPartnerAddress(host))
  )
    throw new Error("partner_endpoint_not_public_https");
  return new Promise((resolve, reject) => {
    let rejectBody: ((error: Error) => void) | undefined;
    const req = request(
      url,
      {
        method: "POST",
        headers: Object.fromEntries(new Headers(init?.headers)),
        ...(init?.signal ? { signal: init.signal } : {}),
        lookup: (hostname, options, callback) => {
          lookup(
            hostname,
            { all: true, verbatim: true },
            (error, addresses) => {
              if (error) {
                callback(error, "", 4);
                return;
              }
              if (
                !addresses.length ||
                addresses.some((item) => !isPublicPartnerAddress(item.address))
              ) {
                callback(new Error("partner_endpoint_dns_not_public"), "", 4);
                return;
              }
              if (options.all) callback(null, addresses);
              else callback(null, addresses[0]!.address, addresses[0]!.family);
            },
          );
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        const ok = status >= 200 && status < 300;
        // Preserve headers immediately. Non-ack responses need no body; a
        // reset/stall must not turn a known credential/endpoint error into a
        // status-less automatic retry. Redirects are never followed.
        if (![200, 201, 202].includes(status)) {
          response.on("error", () => {});
          resolve({ ok, status });
          response.destroy();
          return;
        }
        const body = new Promise<string>((resolveText, rejectText) => {
          rejectBody = rejectText;
          const chunks: Buffer[] = [];
          let size = 0;
          // Retain at most 4 KiB; an oversized ack is invalid.
          response.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > PARTNER_NOTIFICATION_MAX_ACK_BODY_BYTES) {
              resolveText(
                " ".repeat(PARTNER_NOTIFICATION_MAX_ACK_BODY_BYTES + 1),
              );
              response.destroy();
            } else chunks.push(chunk);
          });
          response.on("end", () =>
            resolveText(Buffer.concat(chunks).toString("utf8")),
          );
          response.on("error", rejectText);
          response.on("aborted", () =>
            rejectText(new Error("partner_ack_body_aborted")),
          );
          response.on("close", () => {
            if (!response.complete)
              rejectText(new Error("partner_ack_body_incomplete"));
          });
        });
        // A socket can fail before dispatch starts reading text(). Keep that
        // rejection handled while preserving it for the body reader.
        void body.catch(() => {});
        resolve({ ok, status, text: () => body });
      },
    );
    req.on("error", (error: Error) => {
      reject(error);
      rejectBody?.(error);
    });
    req.end(typeof init?.body === "string" ? init.body : undefined);
  });
};
