import React, { useState } from "react";
import {
  AdapterType,
  Environment,
} from "@drts/contracts";
import { useTranslation } from "@/lib/i18n";
import {
  ADAPTER_REGISTRY_LOCAL_TRANSLATIONS,
  type AdapterRegistryLocale,
} from "../translations";

export interface RegisterAdapterInput {
  id: string;
  platformCode: string;
  name: string;
  description?: string | undefined;
  adapterType?: AdapterType | undefined;
  environment?: Environment | undefined;
  rolloutStage?: Environment | undefined;
  credentialExpiresAt?: string | null | undefined;
  serviceBuckets?: string[] | undefined;
}

interface RegisterAdapterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRegister: (data: RegisterAdapterInput) => Promise<void> | void;
}

export function RegisterAdapterModal({
  isOpen,
  onClose,
  onRegister,
}: RegisterAdapterModalProps) {
  const { locale } = useTranslation();
  const currentLocale = (
    locale in ADAPTER_REGISTRY_LOCAL_TRANSLATIONS ? locale : "zh"
  ) as AdapterRegistryLocale;
  const copy = ADAPTER_REGISTRY_LOCAL_TRANSLATIONS[currentLocale];

  const [id, setId] = useState("");
  const [platformCode, setPlatformCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [adapterType, setAdapterType] = useState<AdapterType>(
    AdapterType.EXTERNAL_COMBINED,
  );
  const [rolloutStage, setRolloutStage] = useState<Environment>(
    Environment.SANDBOX,
  );
  const [credentialExpiresAt, setCredentialExpiresAt] = useState("");
  const [serviceBuckets, setServiceBuckets] = useState("standard");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (!isOpen) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id.trim() || !platformCode.trim() || !name.trim()) {
      setFormError("ID, Platform Code, and Name are required.");
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const buckets = serviceBuckets
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      await onRegister({
        id: id.trim(),
        platformCode: platformCode.trim(),
        name: name.trim(),
        description: description.trim() || undefined,
        adapterType,
        environment: Environment.PRODUCTION,
        rolloutStage,
        credentialExpiresAt: credentialExpiresAt.trim()
          ? new Date(credentialExpiresAt).toISOString()
          : null,
        serviceBuckets: buckets.length > 0 ? buckets : ["standard"],
      });

      // Reset form
      setId("");
      setPlatformCode("");
      setName("");
      setDescription("");
      setCredentialExpiresAt("");
      setServiceBuckets("standard");
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center bg-black bg-opacity-50"
    >
      <div className="bg-white rounded-lg p-6 shadow-xl max-w-2xl w-full mx-4">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              {copy.registerModalTitle}
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              {copy.registerModalSubtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {formError && (
          <div className="mb-4 p-3 rounded bg-red-50 border border-red-200 text-red-700 text-xs">
            {formError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="reg-id"
                className="block text-xs font-medium text-gray-700 mb-1"
              >
                {copy.fieldId} *
              </label>
              <input
                id="reg-id"
                type="text"
                required
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder={copy.placeholderId}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label
                htmlFor="reg-platformCode"
                className="block text-xs font-medium text-gray-700 mb-1"
              >
                {copy.fieldPlatformCode} *
              </label>
              <input
                id="reg-platformCode"
                type="text"
                required
                value={platformCode}
                onChange={(e) => setPlatformCode(e.target.value)}
                placeholder={copy.placeholderPlatformCode}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="reg-name"
              className="block text-xs font-medium text-gray-700 mb-1"
            >
              {copy.fieldName} *
            </label>
            <input
              id="reg-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={copy.placeholderName}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label
              htmlFor="reg-description"
              className="block text-xs font-medium text-gray-700 mb-1"
            >
              {copy.fieldDescription}
            </label>
            <textarea
              id="reg-description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={copy.placeholderDescription}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="reg-adapterType"
                className="block text-xs font-medium text-gray-700 mb-1"
              >
                {copy.fieldAdapterType}
              </label>
              <select
                id="reg-adapterType"
                value={adapterType}
                onChange={(e) => setAdapterType(e.target.value as AdapterType)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value={AdapterType.EXTERNAL_COMBINED}>
                  EXTERNAL_COMBINED
                </option>
                <option value={AdapterType.EXTERNAL_REST}>EXTERNAL_REST</option>
                <option value={AdapterType.EXTERNAL_WEBHOOK}>
                  EXTERNAL_WEBHOOK
                </option>
                <option value={AdapterType.NATIVE}>NATIVE</option>
                <option value={AdapterType.INTERNAL}>INTERNAL</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="reg-rolloutStage"
                className="block text-xs font-medium text-gray-700 mb-1"
              >
                {copy.fieldRolloutStage}
              </label>
              <select
                id="reg-rolloutStage"
                value={rolloutStage}
                onChange={(e) => setRolloutStage(e.target.value as Environment)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value={Environment.SANDBOX}>SANDBOX</option>
                <option value={Environment.DEVELOPMENT}>DEVELOPMENT</option>
                <option value={Environment.STAGING}>STAGING</option>
                <option value={Environment.PRODUCTION}>PRODUCTION</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="reg-credentialExpiresAt"
                className="block text-xs font-medium text-gray-700 mb-1"
              >
                {copy.fieldExpiresAt}
              </label>
              <input
                id="reg-credentialExpiresAt"
                type="date"
                value={credentialExpiresAt}
                onChange={(e) => setCredentialExpiresAt(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label
                htmlFor="reg-serviceBuckets"
                className="block text-xs font-medium text-gray-700 mb-1"
              >
                {copy.fieldServiceBuckets}
              </label>
              <input
                id="reg-serviceBuckets"
                type="text"
                value={serviceBuckets}
                onChange={(e) => setServiceBuckets(e.target.value)}
                placeholder="standard, accessible"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none"
            >
              {copy.cancel}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {submitting ? "..." : copy.btnSubmitRegister}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
