import React, { useEffect, useState } from "react";
import {
  PlatformAdapter,
  Policy,
  RolloutStatus,
  SupportedAction,
  UpdatePlatformAdapterCommand,
} from "@drts/contracts";
import { useTranslation } from "@/lib/i18n";
import {
  formatPlatformCodeLabel,
  formatSupportedActionDescription,
  formatSupportedActionLabel,
} from "@/lib/localized-labels";

interface EditAdapterModalProps {
  adapter: PlatformAdapter | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedAdapter: UpdatePlatformAdapterCommand) => void;
}

export function EditAdapterModal({
  adapter,
  isOpen,
  onClose,
  onSave,
}: EditAdapterModalProps) {
  const { locale, t } = useTranslation();
  const [editedAdapter, setEditedAdapter] = useState<PlatformAdapter | null>(
    null,
  );

  useEffect(() => {
    if (adapter) {
      setEditedAdapter(JSON.parse(JSON.stringify(adapter)));
    }
  }, [adapter, isOpen]);

  if (!isOpen || !editedAdapter) {
    return null;
  }

  const handleInputChange = (field: string, value: any) => {
    setEditedAdapter((prev: PlatformAdapter | null) => {
      if (!prev) return null;
      if (field === "policies.serviceBuckets") {
        return {
          ...prev,
          policies: {
            ...(prev.policies as Policy),
            serviceBuckets: value
              .split(",")
              .map((entry: string) => entry.trim())
              .filter((entry: string) => entry !== ""),
          },
        };
      }
      if (field.includes(".")) {
        const [key1, key2] = field.split(".") as [
          keyof PlatformAdapter,
          string,
        ];
        return {
          ...prev,
          [key1]: {
            ...(prev[key1] as any),
            [key2]: value,
          },
        };
      }
      return { ...prev, [field]: value };
    });
  };

  const handleSave = () => {
    if (!editedAdapter) return;

    const updateCommand: UpdatePlatformAdapterCommand = {
      config: { isEnabled: editedAdapter.config.isEnabled },
      rolloutStatus: editedAdapter.rolloutStatus,
      policies: {
        serviceBuckets: editedAdapter.policies.serviceBuckets,
        maxCandidates: editedAdapter.policies.maxCandidates,
        acceptTimeoutSeconds: editedAdapter.policies.acceptTimeoutSeconds,
        manualFallbackThresholdSeconds:
          editedAdapter.policies.manualFallbackThresholdSeconds,
        financeAuthorityMode: editedAdapter.policies.financeAuthorityMode,
      },
    };

    if (editedAdapter.webhookStatus) {
      updateCommand.webhookStatus = {
        url: editedAdapter.webhookStatus.url,
        isEnabled: editedAdapter.webhookStatus.isEnabled,
      };
    }

    onSave(updateCommand);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black bg-opacity-50">
      <div className="w-full max-w-3xl rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">
            {t("adapterRegistry.modal.title", { name: editedAdapter.name })}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
            aria-label={t("common.close")}
          >
            &times;
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              {t("adapterRegistry.modal.name")}
            </label>
            <p className="text-gray-900">{editedAdapter.name}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              {t("adapterRegistry.modal.version")}
            </label>
            <p className="text-gray-900">{editedAdapter.version}</p>
          </div>

          <div className="col-span-2 flex items-center justify-between">
            <label
              htmlFor="isEnabled"
              className="block text-sm font-medium text-gray-700"
            >
              {t("adapterRegistry.modal.enabled")}
            </label>
            <div className="flex items-center">
              <input
                type="checkbox"
                id="isEnabled"
                checked={editedAdapter.config.isEnabled}
                onChange={(e) =>
                  handleInputChange("config.isEnabled", e.target.checked)
                }
                className="h-5 w-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="rolloutStatus"
              className="block text-sm font-medium text-gray-700"
            >
              {t("adapterRegistry.modal.rolloutStatus")}
            </label>
            <select
              id="rolloutStatus"
              value={editedAdapter.rolloutStatus}
              onChange={(e) =>
                handleInputChange("rolloutStatus", e.target.value)
              }
              className="mt-1 block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
            >
              {(Object.values(RolloutStatus) as RolloutStatus[]).map(
                (status) => (
                  <option key={status} value={status}>
                    {formatPlatformCodeLabel(locale, status)}
                  </option>
                ),
              )}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              {t("adapterRegistry.modal.credentialStatus")}
            </label>
            <p className="text-gray-900">
              {formatPlatformCodeLabel(locale, editedAdapter.credentialStatus)}
            </p>
          </div>

          <div className="col-span-2 grid grid-cols-2 gap-4">
            <h3 className="col-span-2 text-lg font-medium text-gray-900">
              {t("adapterRegistry.modal.webhookSettings")}
            </h3>
            <div className="col-span-2 flex items-center justify-between">
              <label
                htmlFor="webhookEnabled"
                className="block text-sm font-medium text-gray-700"
              >
                {t("adapterRegistry.modal.webhookEnabled")}
              </label>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="webhookEnabled"
                  checked={editedAdapter.webhookStatus?.isEnabled ?? false}
                  onChange={(e) =>
                    handleInputChange(
                      "webhookStatus.isEnabled",
                      e.target.checked,
                    )
                  }
                  className="h-5 w-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div>
              <label
                htmlFor="webhookUrl"
                className="block text-sm font-medium text-gray-700"
              >
                {t("adapterRegistry.modal.webhookUrl")}
              </label>
              <input
                type="url"
                id="webhookUrl"
                value={editedAdapter.webhookStatus?.url ?? ""}
                onChange={(e) =>
                  handleInputChange("webhookStatus.url", e.target.value)
                }
                className="mt-1 block w-full rounded-md border-gray-300 py-2 pl-3 text-base focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
                placeholder={t("adapterRegistry.modal.webhookPlaceholder")}
              />
            </div>
          </div>

          <div className="col-span-2 grid grid-cols-2 gap-4">
            <h3 className="col-span-2 text-lg font-medium text-gray-900">
              {t("adapterRegistry.modal.policySettings")}
            </h3>
            <div>
              <label
                htmlFor="policies.serviceBuckets"
                className="block text-sm font-medium text-gray-700"
              >
                {t("adapterRegistry.modal.serviceBuckets")}
              </label>
              <input
                type="text"
                id="policies.serviceBuckets"
                value={editedAdapter.policies.serviceBuckets.join(", ")}
                onChange={(e) =>
                  handleInputChange("policies.serviceBuckets", e.target.value)
                }
                className="mt-1 block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="policies.maxCandidates"
                className="block text-sm font-medium text-gray-700"
              >
                {t("adapterRegistry.modal.maxCandidates")}
              </label>
              <input
                type="number"
                id="policies.maxCandidates"
                value={editedAdapter.policies.maxCandidates}
                onChange={(e) =>
                  handleInputChange(
                    "policies.maxCandidates",
                    parseInt(e.target.value, 10),
                  )
                }
                className="mt-1 block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="policies.acceptTimeoutSeconds"
                className="block text-sm font-medium text-gray-700"
              >
                {t("adapterRegistry.modal.acceptTimeoutSeconds")}
              </label>
              <input
                type="number"
                id="policies.acceptTimeoutSeconds"
                value={editedAdapter.policies.acceptTimeoutSeconds}
                onChange={(e) =>
                  handleInputChange(
                    "policies.acceptTimeoutSeconds",
                    parseInt(e.target.value, 10),
                  )
                }
                className="mt-1 block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="policies.manualFallbackThresholdSeconds"
                className="block text-sm font-medium text-gray-700"
              >
                {t("adapterRegistry.modal.manualFallbackThresholdSeconds")}
              </label>
              <input
                type="number"
                id="policies.manualFallbackThresholdSeconds"
                value={editedAdapter.policies.manualFallbackThresholdSeconds}
                onChange={(e) =>
                  handleInputChange(
                    "policies.manualFallbackThresholdSeconds",
                    parseInt(e.target.value, 10),
                  )
                }
                className="mt-1 block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
              />
            </div>
          </div>

          <div className="col-span-2">
            <h3 className="mb-2 text-lg font-medium text-gray-900">
              {t("adapterRegistry.modal.supportedActions")}
            </h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {editedAdapter.supportedActions.length > 0 ? (
                editedAdapter.supportedActions.map(
                  (action: SupportedAction) => (
                    <div
                      key={action.name}
                      className="rounded-md border border-gray-200 bg-gray-50 p-3"
                    >
                      <p className="text-sm font-medium text-gray-900">
                        {formatSupportedActionLabel(locale, action.name)}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        {formatSupportedActionDescription(locale, action)}
                      </p>
                    </div>
                  ),
                )
              ) : (
                <p className="text-sm text-gray-500">
                  {t("adapterRegistry.modal.noSupportedActions")}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="mr-4 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={handleSave}
            className="rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            {t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
