import { hash, object, requireFact, text, type ObjectData } from "./protocol";

export const ORIGINAL_UNKNOWN_BOOKING = Object.freeze({
  originalRun: 39445009990,
  definitionSha: "109f0f8ee19f2811897843a0420f4f92f2a03882",
  runtimeSha: "109f0f8ee19f2811897843a0420f4f92f2a03882",
  entrySlug: "yuhe-residence",
  partnerUserRef: "referral-demo-yuhe-residence",
  quoteId: "b75624b9-5ad8-4b27-8e34-226751525144",
  bodySha256:
    "d1c56482ee75626508394d283bcc89113e6d6d5b193a01102301aae4f751dd60",
  keySha256: "565854cb0fbcef1c83696801a10c956ce199ed6293e5acc774c402269bf624a0",
});

type OriginalBinding = {
  originalRun: number;
  definitionSha: string;
  runtimeSha: string;
  entrySlug: string;
  partnerUserRef: string;
  quoteId: string;
  bodySha256: string;
  keySha256: string;
};
export type OriginalJournalCommand = {
  journal: Readonly<ObjectData>;
  command: Readonly<ObjectData>;
  rawBody: string;
  key: string;
  binding: Readonly<OriginalBinding>;
};

export function parseOriginalUnknownBookingJournal(
  value: unknown,
  runtimeSha: string,
  binding: Readonly<OriginalBinding> = ORIGINAL_UNKNOWN_BOOKING,
): OriginalJournalCommand {
  const journal = object(value);
  requireFact(
    journal.version === 1 &&
      journal.state === "ack_unknown" &&
      journal.syntheticData === true &&
      journal.orderId === undefined,
    "original unknown journal state required",
  );
  requireFact(
    journal.definitionSha === binding.definitionSha &&
      journal.runtimeSha === binding.runtimeSha &&
      runtimeSha === binding.runtimeSha &&
      journal.entrySlug === binding.entrySlug &&
      journal.partnerUserRef === binding.partnerUserRef &&
      journal.quoteId === binding.quoteId &&
      journal.bodySha256 === binding.bodySha256 &&
      typeof journal.nonce === "string" &&
      journal.nonce.startsWith(`owned-referral-${binding.originalRun}-`),
    "original unknown journal binding required",
  );
  const rawBody = text(journal.body);
  const key = text(journal.idempotencyKey);
  requireFact(
    Buffer.byteLength(rawBody, "utf8") <= 16384 &&
      hash(Buffer.from(rawBody, "utf8")) === binding.bodySha256 &&
      hash(Buffer.from(key, "utf8")) === binding.keySha256,
    "original unknown journal exact body and key required",
  );
  const command = object(JSON.parse(rawBody));
  const allowed = new Set([
    "entrySlug",
    "quoteId",
    "pickupAddress",
    "dropoffAddress",
    "vehicleType",
    "passengerName",
    "passengerPhone",
    "partnerUserRef",
    "idempotencyKey",
  ]);
  requireFact(
    Object.keys(command).every((name) => allowed.has(name)) &&
      Object.values(command).every(
        (item) => typeof item === "string" && item.length <= 2048,
      ) &&
      command.entrySlug === binding.entrySlug &&
      command.quoteId === binding.quoteId &&
      command.idempotencyKey === key &&
      (command.partnerUserRef === undefined ||
        command.partnerUserRef === binding.partnerUserRef) &&
      [
        "pickupAddress",
        "dropoffAddress",
        "passengerName",
        "passengerPhone",
      ].every(
        (name) => typeof command[name] === "string" && Boolean(command[name]),
      ) &&
      JSON.stringify(command) === rawBody,
    "original exact immediate business command required",
  );
  return {
    journal: Object.freeze({ ...journal }),
    command: Object.freeze(command),
    rawBody,
    key,
    binding,
  };
}

/** One exact idempotency recovery, never a new quote/body/key or transport retry. */
export async function recoverOriginalUnknownBookingAck(
  original: OriginalJournalCommand,
  send: (command: Readonly<ObjectData>, key: string) => Promise<unknown>,
) {
  // NativeTransport serializes this same object once. Preserve property order
  // and fail closed rather than normalizing or reconstructing business fields.
  requireFact(
    JSON.stringify(original.command) === original.rawBody,
    "original recovery serialization exact",
  );
  const recovered = object(await send(original.command, original.key));
  const orderId = text(recovered.orderId);
  requireFact(
    object(recovered.quote).quoteId === original.binding.quoteId &&
      recovered.replayed === true,
    "original recovery replay ACK and quote required",
  );
  return Object.freeze({
    originalRun: original.binding.originalRun,
    orderId,
    quoteId: original.binding.quoteId,
    bodySha256: original.binding.bodySha256,
    entrySlug: original.binding.entrySlug,
  });
}
