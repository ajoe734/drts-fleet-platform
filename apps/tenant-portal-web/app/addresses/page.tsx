import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type {
  TenantAddressRecord,
  UpsertTenantAddressCommand,
} from "@drts/contracts";
import { AppShellCard } from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";
import { getTenantRoleSnapshot, requireCapability } from "@/lib/rbac";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

export default async function AddressesPage({
  searchParams,
}: {
  searchParams?: { edit?: string; error?: string };
}) {
  const client = await getTenantClient();

  let addresses: TenantAddressRecord[] = [];
  let error: string | null = null;

  try {
    addresses = await client.listAddresses();
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  const editId = searchParams?.edit;
  const editingAddress = editId
    ? addresses.find((a) => a.addressId === editId)
    : null;

  const formError = searchParams?.error ?? null;

  return (
    <main className="app-grid">
      <AppShellCard
        title="Addresses"
        description={`${addresses.length} address(es) found.`}
      >
        {error && (
          <div className="error-banner">
            <strong>Error loading addresses:</strong> {error}
          </div>
        )}

        {editingAddress ? (
          <EditAddressForm address={editingAddress} />
        ) : (
          <>
            <NewAddressForm formError={formError} />
            <AddressList addresses={addresses} />
          </>
        )}

        <Link className="route-link" href="/">
          Back to home
        </Link>
      </AppShellCard>
    </main>
  );
}

function NewAddressForm({ formError }: { formError: string | null }) {
  return (
    <div className="form-section">
      <h3>New Address</h3>
      {formError && (
        <div className="error-banner">
          <strong>Error:</strong> {formError}
        </div>
      )}
      <form action={createAddress} className="form-grid">
        <div className="form-row">
          <label htmlFor="addressName">Address Name *</label>
          <input type="text" id="addressName" name="addressName" required />
        </div>
        <div className="form-row">
          <label htmlFor="addressText">Address *</label>
          <textarea id="addressText" name="addressText" required rows={3} />
        </div>
        <div className="form-row">
          <label htmlFor="lat">Latitude</label>
          <input type="number" step="any" id="lat" name="lat" />
        </div>
        <div className="form-row">
          <label htmlFor="lng">Longitude</label>
          <input type="number" step="any" id="lng" name="lng" />
        </div>
        <div className="form-row">
          <label htmlFor="tags">Tags (comma-separated)</label>
          <input
            type="text"
            id="tags"
            name="tags"
            placeholder="e.g. office, warehouse"
          />
        </div>
        <div className="form-row">
          <label htmlFor="ownerPassengerId">Owner Passenger ID</label>
          <input type="text" id="ownerPassengerId" name="ownerPassengerId" />
        </div>
        <div className="form-row">
          <label>
            <input type="checkbox" name="activeFlag" defaultChecked /> Active
          </label>
        </div>
        <button type="submit">Create Address</button>
      </form>
    </div>
  );
}

function EditAddressForm({ address }: { address: TenantAddressRecord }) {
  return (
    <div className="form-section">
      <h3>Edit Address: {address.addressName}</h3>
      <form action={updateAddress} className="form-grid">
        <input type="hidden" name="addressId" value={address.addressId} />
        <div className="form-row">
          <label htmlFor="addressName">Address Name *</label>
          <input
            type="text"
            id="addressName"
            name="addressName"
            defaultValue={address.addressName}
            required
          />
        </div>
        <div className="form-row">
          <label htmlFor="addressText">Address *</label>
          <textarea
            id="addressText"
            name="addressText"
            defaultValue={address.addressText}
            required
            rows={3}
          />
        </div>
        <div className="form-row">
          <label htmlFor="lat">Latitude</label>
          <input
            type="number"
            step="any"
            id="lat"
            name="lat"
            defaultValue={address.lat ?? ""}
          />
        </div>
        <div className="form-row">
          <label htmlFor="lng">Longitude</label>
          <input
            type="number"
            step="any"
            id="lng"
            name="lng"
            defaultValue={address.lng ?? ""}
          />
        </div>
        <div className="form-row">
          <label htmlFor="tags">Tags (comma-separated)</label>
          <input
            type="text"
            id="tags"
            name="tags"
            defaultValue={address.tags.join(", ")}
            placeholder="e.g. office, warehouse"
          />
        </div>
        <div className="form-row">
          <label htmlFor="ownerPassengerId">Owner Passenger ID</label>
          <input
            type="text"
            id="ownerPassengerId"
            name="ownerPassengerId"
            defaultValue={address.ownerPassengerId ?? ""}
          />
        </div>
        <div className="form-row">
          <label>
            <input
              type="checkbox"
              name="activeFlag"
              defaultChecked={address.activeFlag}
            />{" "}
            Active
          </label>
        </div>
        <div className="form-actions">
          <button type="submit">Save Changes</button>
          <Link href="/addresses">Cancel</Link>
        </div>
      </form>
    </div>
  );
}

function AddressList({ addresses }: { addresses: TenantAddressRecord[] }) {
  return (
    <div className="data-table">
      {addresses.length === 0 ? (
        <p className="empty-state">No addresses found. Create one above.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Address</th>
              <th>Tags</th>
              <th>Lat</th>
              <th>Lng</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {addresses.map((a) => (
              <tr key={a.addressId}>
                <td>{a.addressName}</td>
                <td>{a.addressText}</td>
                <td>{a.tags.length > 0 ? a.tags.join(", ") : "-"}</td>
                <td>{a.lat != null ? a.lat.toFixed(6) : "-"}</td>
                <td>{a.lng != null ? a.lng.toFixed(6) : "-"}</td>
                <td>{a.activeFlag ? "Active" : "Inactive"}</td>
                <td>
                  <Link href={`/addresses?edit=${a.addressId}`}>Edit</Link>
                  {" | "}
                  <form action={deleteAddress} style={{ display: "inline" }}>
                    <input type="hidden" name="addressId" value={a.addressId} />
                    <ConfirmSubmitButton
                      type="submit"
                      confirmMessage={`Delete address "${a.addressName}"?`}
                    >
                      Delete
                    </ConfirmSubmitButton>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

async function createAddress(formData: FormData) {
  "use server";
  const snapshot = await getTenantRoleSnapshot();
  requireCapability(
    snapshot.capabilities.canWriteTenant,
    "Tenant write authority required to manage addresses.",
  );
  const client = await getTenantClient();

  const tagsRaw = formData.get("tags") as string;
  const tags = tagsRaw
    ? tagsRaw
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

  const latVal = formData.get("lat") as string;
  const lngVal = formData.get("lng") as string;

  const command: UpsertTenantAddressCommand = {
    addressName: formData.get("addressName") as string,
    addressText: formData.get("addressText") as string,
    lat: latVal ? parseFloat(latVal) : null,
    lng: lngVal ? parseFloat(lngVal) : null,
    tags,
    ownerPassengerId: (formData.get("ownerPassengerId") as string) || null,
    activeFlag: formData.get("activeFlag") !== null,
  };

  try {
    await client.upsertAddress(command);
    revalidatePath("/addresses");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    redirect(`/addresses?error=${encodeURIComponent(msg)}`);
  }
}

async function updateAddress(formData: FormData) {
  "use server";
  const snapshot = await getTenantRoleSnapshot();
  requireCapability(
    snapshot.capabilities.canWriteTenant,
    "Tenant write authority required to manage addresses.",
  );
  const client = await getTenantClient();

  const tagsRaw = formData.get("tags") as string;
  const tags = tagsRaw
    ? tagsRaw
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

  const latVal = formData.get("lat") as string;
  const lngVal = formData.get("lng") as string;

  const command: UpsertTenantAddressCommand = {
    addressId: formData.get("addressId") as string,
    addressName: formData.get("addressName") as string,
    addressText: formData.get("addressText") as string,
    lat: latVal ? parseFloat(latVal) : null,
    lng: lngVal ? parseFloat(lngVal) : null,
    tags,
    ownerPassengerId: (formData.get("ownerPassengerId") as string) || null,
    activeFlag: formData.get("activeFlag") !== null,
  };

  try {
    await client.upsertAddress(command);
    revalidatePath("/addresses");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    redirect(
      `/addresses?edit=${command.addressId}&error=${encodeURIComponent(msg)}`,
    );
  }
}

async function deleteAddress(formData: FormData) {
  "use server";
  const snapshot = await getTenantRoleSnapshot();
  requireCapability(
    snapshot.capabilities.canWriteTenant,
    "Tenant write authority required to manage addresses.",
  );
  const client = await getTenantClient();

  const addressId = formData.get("addressId") as string;

  // API uses upsert with activeFlag=false to soft-delete
  const command: UpsertTenantAddressCommand = {
    addressId,
    addressName: "DELETED",
    addressText: "DELETED",
    activeFlag: false,
  };

  try {
    await client.upsertAddress(command);
    revalidatePath("/addresses");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    redirect(`/addresses?error=${encodeURIComponent(msg)}`);
  }
}
