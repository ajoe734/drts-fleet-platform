// import { PageHeader } from '@/components/ui/page-header'; // Assuming a PageHeader component exists
import { AdapterList } from "./components/AdapterList"; // Import the new AdapterList component

export default function AdapterRegistryPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold p-4">Platform Adapter Registry</h1>{" "}
      {/* Replaced PageHeader with h1 */}
      <div className="p-4">
        <p>Manage your platform adapters here.</p>
        <AdapterList /> {/* Render the AdapterList component */}
      </div>
    </div>
  );
}
