import type {
  MultiTaxiFareManagementList,
  MultiTaxiFareManagementWireList,
  MultiTaxiManagedFareVersion,
  MultiTaxiManagedFareWireVersion,
} from "@drts/contracts";

export function fareVersionWire(
  row: MultiTaxiManagedFareVersion,
): MultiTaxiManagedFareWireVersion {
  const { additionalFees, ...parameters } = row.tariff;
  return {
    ...row,
    tariff: {
      ...parameters,
      additionalFeeEntries: Object.entries(additionalFees).map(
        ([key, amount]) => ({
          key,
          amount,
        }),
      ),
    },
  };
}

export function fareListWire(
  list: MultiTaxiFareManagementList,
): MultiTaxiFareManagementWireList {
  return { ...list, items: list.items.map(fareVersionWire) };
}
