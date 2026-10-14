// Source-gap probe, deliberately NOT an acceptance test. Run after API build.
// Only registry lookup, SQL storage and phone configuration are fixtures.
// The completion producer, writer, view mapping and both renderers are real.
import contracts from "../../../packages/contracts/dist/index.js";
import { OwnedMobilityService } from "../../../apps/api/dist/modules/owned-mobility/owned-mobility.service.js";
import { CertificateSupportService } from "../../../apps/api/dist/modules/certificate-support/certificate-support.service.js";
const { PLATFORM_CURRENCY } = contracts;

async function main() {
  delete process.env.MULTI_TAXI_CERTIFICATE_SERVICE_PHONE;
  delete process.env.MULTI_TAXI_AUTHORITY_COMPLAINT_PHONE;
  const producer = Object.create(OwnedMobilityService.prototype);
  producer.regulatoryRegistryService = {
    listVehicles: () => [{ vehicleId: "unit-vehicle", plateNo: "UNIT-01" }],
  };
  const event =
    OwnedMobilityService.prototype.buildMultiTaxiCertificateEvent.call(
      producer,
      {
        orderId: "11111111-1111-4111-8111-111111111111",
        fixedPrice: false,
        pickup: { address: "測試起點" },
        dropoff: { address: "測試終點" },
      },
      {
        taskId: "unit-trip",
        vehicleId: "unit-vehicle",
        startedAt: "2026-10-10T00:00:00Z",
      },
      {
        completedAt: "2026-10-10T00:10:00Z",
        actualDistanceKm: 2,
        actualDurationSec: 600,
        fare: { currency: PLATFORM_CURRENCY, amountMinor: 10000 },
        actualFareBreakdown: {
          startMinor: 8500,
          distanceMinor: 1000,
          delayMinor: 500,
          nightMinor: 0,
        },
      },
      { photos: [], expenseItems: [], signatureId: null },
      {
        driverSurname: "歐陽",
        driverSurnameSource: "driver_profile_declared",
        driverSurnameProfileUpdatedAt: "2026-10-09T01:02:03.000Z",
      },
    );
  let row;
  const repository = {
    isEnabled: () => true,
    persistInitial: async (input) => {
      row = { ...input, receiptVersion: 1, isCurrent: true };
      return row;
    },
    findById: async () => row,
  };
  const certificates = new CertificateSupportService(repository);
  await certificates.writeCompletedTrip(event);
  const view = await certificates.get(row.receiptId);
  const html = (
    await certificates.getArtifact(row.receiptId, "html")
  ).buffer.toString("utf8");
  const pdf = (
    await certificates.getArtifact(row.receiptId, "pdf")
  ).buffer.toString("utf8");
  const pdfText = [...pdf.matchAll(/<([A-F0-9]+)> Tj/g)]
    .map((match) => Buffer.from(match[1], "hex").swap16().toString("utf16le"))
    .join("\n");
  const labels = [
    "車隊／派遣業者",
    "駕駛（姓氏＋執登證號遮碼）",
    "起程",
    "續程",
    "延滯計時",
    "夜間加成",
    "車資合計",
    "支付方式",
  ];
  const missingHtml = labels.filter((label) => !html.includes(label));
  const missingPdf = labels.filter((label) => !pdfText.includes(label));
  const gaps = [
    ...missingHtml.map((field) => `html:${field}`),
    ...missingPdf.map((field) => `pdf:${field}`),
  ];
  let passengerReadiness;
  try {
    await certificates.getPassengerView(row.receiptId, event.orderId);
    passengerReadiness = "ready";
  } catch (error) {
    passengerReadiness = error.code;
  }
  if (event.consumerServicePhone !== "02-2944-0985")
    gaps.push("default_service_phone");
  console.log(
    JSON.stringify(
      {
        source:
          "OwnedMobilityService.buildMultiTaxiCertificateEvent -> CertificateSupportService.writeCompletedTrip/getArtifact",
        mockBoundary:
          "registry lookup, supplied completed fare/profile snapshot and receipt SQL fixtures; configuration unset; no issuer/credential/payment/total authority supplied",
        producerFields: Object.keys(event),
        persistedCapturedFacts: {
          actualFareBreakdown: row.record.actualFareBreakdown,
          driverSurname: row.record.driverSurname,
          driverSurnameSource: row.record.driverSurnameSource,
          driverSurnameProfileUpdatedAt:
            row.record.driverSurnameProfileUpdatedAt,
        },
        defaultServicePhone: event.consumerServicePhone,
        htmlUrl: view.htmlUrl,
        pdfUrl: view.pdfUrl,
        missingHtml,
        missingPdf,
        gaps,
        passengerReadiness,
        conclusion: gaps.length
          ? "E04_REQUIREMENTS_UNMET"
          : "source_mapping_present_only_not_acceptance",
      },
      null,
      2,
    ),
  );
  process.exitCode = gaps.length ? 2 : 0;
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
