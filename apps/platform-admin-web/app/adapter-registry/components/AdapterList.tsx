import React, { useState, useEffect } from "react";
import { PlatformAdapter, UpdatePlatformAdapterCommand } from "@drts/contracts";
import { EditAdapterModal } from "./EditAdapterModal"; // Import the new modal component
import { ApiClient } from "@drts/api-client";

// Initialize ApiClient
// Assuming API is served from the same origin or proxied via '/api' in development
const apiClient = new ApiClient({
  baseUrl: "", // Use empty string for relative paths, assuming proxy handles it
  defaultHeaders: {
    // Add any default headers required by your API, e.g., for authentication
  },
});

export function AdapterList() {
  const [adapters, setAdapters] = useState<PlatformAdapter[]>([]); // Initialize with empty array
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedAdapter, setSelectedAdapter] =
    useState<PlatformAdapter | null>(null);

  useEffect(() => {
    const fetchAdapters = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const fetchedAdapters = await apiClient.listPlatformAdapters();
        setAdapters(fetchedAdapters);
      } catch (err) {
        console.error("Error fetching adapters:", err);
        setError("Failed to fetch adapters. Please try again later.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchAdapters();
  }, []); // Empty dependency array ensures this runs only once on mount

  const handleEditClick = (adapter: PlatformAdapter) => {
    setSelectedAdapter(adapter);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedAdapter(null);
  };

  const handleSaveAdapter = async (
    updatedData: UpdatePlatformAdapterCommand,
  ) => {
    if (!selectedAdapter) return;

    console.log("Saving updated adapter data:", updatedData);
    console.log("Original adapter ID:", selectedAdapter.id);

    try {
      // Call the API to update the adapter
      const updatedAdapter = await apiClient.updatePlatformAdapter(
        selectedAdapter.id,
        updatedData,
      );

      // Update the local state with the response from the API
      setAdapters((prevAdapters) =>
        prevAdapters.map((adapter) =>
          adapter.id === selectedAdapter.id ? updatedAdapter : adapter,
        ),
      );
      console.log("Adapter updated successfully:", updatedAdapter);
    } catch (err) {
      console.error("Error updating adapter:", err);
      setError("Failed to update adapter. Please try again later.");
      // Handle error appropriately (e.g., show a toast message to the user)
    } finally {
      // Modal will be closed by EditAdapterModal's onClose, or can be closed here too
      // handleCloseModal();
    }
  };

  return (
    <div className="p-4 border rounded-md shadow-sm overflow-x-auto">
      <h3 className="text-lg font-semibold mb-4">Adapters</h3>

      {isLoading && <p>Loading adapters...</p>}
      {error && <p className="text-red-500">{error}</p>}

      {!isLoading && !error && adapters.length > 0 ? (
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Name
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Version
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Environment
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Enabled
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Rollout Status
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Credential Status
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Webhook Enabled
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Actions
              </th>{" "}
              {/* New column header */}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {adapters.map((adapter) => (
              <tr key={adapter.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {adapter.name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {adapter.version}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {adapter.environment}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {adapter.config.isEnabled ? "Yes" : "No"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {adapter.rolloutStatus}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {adapter.credentialStatus}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {adapter.webhookStatus
                    ? adapter.webhookStatus.isEnabled
                      ? "Yes"
                      : "No"
                    : "N/A"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  <button
                    onClick={() => handleEditClick(adapter)}
                    className="text-indigo-600 hover:text-indigo-900 hover:underline"
                  >
                    Edit
                  </button>
                </td>{" "}
                {/* New column content */}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        !isLoading && !error && <p>No adapters found.</p>
      )}

      <EditAdapterModal
        adapter={selectedAdapter}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSave={handleSaveAdapter}
      />
    </div>
  );
}
