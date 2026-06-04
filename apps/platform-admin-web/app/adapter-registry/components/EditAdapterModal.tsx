import React, { useState, useEffect } from "react";
import {
  PlatformAdapter,
  RolloutStatus,
  Policy,
  UpdatePlatformAdapterCommand,
} from "@drts/contracts";

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
  const [editedAdapter, setEditedAdapter] = useState<PlatformAdapter | null>(
    null,
  );

  useEffect(() => {
    if (adapter) {
      // Deep clone to avoid direct mutation of the original adapter
      setEditedAdapter(JSON.parse(JSON.stringify(adapter)));
    }
  }, [adapter, isOpen]);

  if (!isOpen || !editedAdapter) {
    return null;
  }

  const handleInputChange = (field: string, value: any) => {
    setEditedAdapter((prev) => {
      if (!prev) return null;
      if (field === "policies.serviceBuckets") {
        return {
          ...prev,
          policies: {
            ...(prev.policies as Policy),
            serviceBuckets: value
              .split(",")
              .map((s: string) => s.trim())
              .filter((s: string) => s !== ""),
          },
        };
      }
      // Handle nested fields like config.isEnabled or webhookStatus.isEnabled
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
        financeAuthorityMode: editedAdapter.policies.financeAuthorityMode, // Keep this even if not editable yet
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
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg p-6 shadow-xl max-w-3xl w-full">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">
            Edit Adapter: {editedAdapter.name}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            &times;
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Name and Version (display only) */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Name
            </label>
            <p className="text-gray-900">{editedAdapter.name}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Version
            </label>
            <p className="text-gray-900">{editedAdapter.version}</p>
          </div>

          {/* Enabled Toggle */}
          <div className="flex items-center justify-between col-span-2">
            <label
              htmlFor="isEnabled"
              className="block text-sm font-medium text-gray-700"
            >
              Enabled
            </label>
            <div className="flex items-center">
              <input
                type="checkbox"
                id="isEnabled"
                checked={editedAdapter.config.isEnabled}
                onChange={(e) =>
                  handleInputChange("config.isEnabled", e.target.checked)
                }
                className="h-5 w-5 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
              />
            </div>
          </div>

          {/* Rollout Status Select */}
          <div>
            <label
              htmlFor="rolloutStatus"
              className="block text-sm font-medium text-gray-700"
            >
              Rollout Status
            </label>
            <select
              id="rolloutStatus"
              value={editedAdapter.rolloutStatus}
              onChange={(e) =>
                handleInputChange("rolloutStatus", e.target.value)
              }
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
            >
              {Object.values(RolloutStatus).map((status) => (
                <option key={status} value={status}>
                  {status.replace("_", " ")}
                </option>
              ))}
            </select>
          </div>

          {/* Credential Status (display only for now) */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Credential Status
            </label>
            <p className="text-gray-900">{editedAdapter.credentialStatus}</p>
          </div>

          {/* Webhook Settings */}
          <div className="col-span-2 grid grid-cols-2 gap-4">
            <h3 className="col-span-2 text-lg font-medium text-gray-900">
              Webhook Settings
            </h3>
            {/* Webhook Enabled Toggle */}
            <div className="flex items-center justify-between col-span-2">
              <label
                htmlFor="webhookEnabled"
                className="block text-sm font-medium text-gray-700"
              >
                Webhook Enabled
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
                  className="h-5 w-5 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                />
              </div>
            </div>
            {/* Webhook URL Input */}
            <div>
              <label
                htmlFor="webhookUrl"
                className="block text-sm font-medium text-gray-700"
              >
                Webhook URL
              </label>
              <input
                type="url"
                id="webhookUrl"
                value={editedAdapter.webhookStatus?.url ?? ""}
                onChange={(e) =>
                  handleInputChange("webhookStatus.url", e.target.value)
                }
                className="mt-1 block w-full pl-3 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                placeholder="https://example.com/webhook"
              />
            </div>
          </div>

          {/* Policy Settings */}
          <div className="col-span-2 grid grid-cols-2 gap-4">
            <h3 className="col-span-2 text-lg font-medium text-gray-900">
              Policy Settings
            </h3>
            {/* Service Buckets Input */}
            <div>
              <label
                htmlFor="policies.serviceBuckets"
                className="block text-sm font-medium text-gray-700"
              >
                Service Buckets (comma-separated)
              </label>
              <input
                type="text"
                id="policies.serviceBuckets"
                value={editedAdapter.policies.serviceBuckets.join(", ")}
                onChange={(e) =>
                  handleInputChange("policies.serviceBuckets", e.target.value)
                }
                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
              />
            </div>
            {/* Max Candidates Input */}
            <div>
              <label
                htmlFor="policies.maxCandidates"
                className="block text-sm font-medium text-gray-700"
              >
                Max Candidates
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
                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
              />
            </div>
            {/* Accept Timeout Seconds Input */}
            <div>
              <label
                htmlFor="policies.acceptTimeoutSeconds"
                className="block text-sm font-medium text-gray-700"
              >
                Accept Timeout (seconds)
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
                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
              />
            </div>
            {/* Manual Fallback Threshold Seconds Input */}
            <div>
              <label
                htmlFor="policies.manualFallbackThresholdSeconds"
                className="block text-sm font-medium text-gray-700"
              >
                Manual Fallback Threshold (seconds)
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
                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
              />
            </div>
          </div>

          <div className="col-span-2">
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Supported Actions
            </h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {editedAdapter.supportedActions.length > 0 ? (
                editedAdapter.supportedActions.map((action) => (
                  <div
                    key={action.name}
                    className="rounded-md border border-gray-200 bg-gray-50 p-3"
                  >
                    <p className="text-sm font-medium text-gray-900">
                      {action.name}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {action.description}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500">
                  No adapter actions are enabled for this platform.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end mt-6">
          <button
            onClick={onClose}
            className="mr-4 px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
