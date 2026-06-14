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
import { getServerLocale } from "@/lib/server-locale";
import { t, type Locale } from "@/lib/translations";

export default async function AddressesPage({
  searchParams,
}: {
  searchParams?: { edit?: string; error?: string };
}) {
  const locale = await getServerLocale();
  const client = await getTenantClient();

  let addresses: TenantAddressRecord[] = [];
  let error: string | null = null;

  try {
    addresses = await client.listAddresses();
  } catch (e) {
    error = e instanceof Error ? e.message : t("addresses.error.unknown", locale);
  }

  const editId = searchParams?.edit;
  const editingAddress = editId
    ? addresses.find((a) => a.addressId === editId)
    : null;

  const formError = searchParams?.error ?? null;

  return (
    <main className="app-grid">
      <AppShellCard
        title={t("addresses.title", locale)}
        description={t("addresses.count", locale, { count: addresses.length })}
      >
        {error && (
          <div className="error-banner">
            <strong>{t("addresses.error.loading", locale)}</strong> {error}
          </div>
        )}

        {editingAddress ? (
          <EditAddressForm address={editingAddress} locale={locale} />
        ) : (
          <>
            <NewAddressForm formError={formError} locale={locale} />
            <AddressList addresses={addresses} locale={locale} />
          </>
        )}

        <Link className="route-link" href="/">
          {t("addresses.backToHome", locale)}
        </Link>
      </AppShellCard>
    </main>
  );
}

function NewAddressForm({
  formError,
  locale,
}: {
  formError: string | null;
  locale: Locale;
}) {
  return (
    <div className="form-section">
      <h3>{t("addresses.new.heading", locale)}</h3>
      {formError && (
        <div className="error-banner">
          <strong>{t("addresses.error.label", locale)}</strong> {formError}
        </div>
      )}
      <form action={createAddress} className="form-grid">
        <div className="form-row">
          <label htmlFor="addressName">{t("addresses.field.name", locale)}</label>
          <input type="text" id="addressName" name="addressName" required />
        </div>
        <div className="form-row">
          <label htmlFor="addressText">{t("addresses.field.address", locale)}</label>
          <textarea id="addressText" name="addressText" required rows={3} />
        </div>
        <div className="form-row">
          <label htmlFor="lat">{t("addresses.field.latitude", locale)}</label>
          <input type="number" step="any" id="lat" name="lat" />
        </div>
        <div className="form-row">
          <label htmlFor="lng">{t("addresses.field.longitude", locale)}</label>
          <input type="number" step="any" id="lng" name="lng" />
        </div>
        <div className="form-row">
          <label htmlFor="tags">{t("addresses.field.tags", locale)}</label>
          <input
            type="text"
            id="tags"
            name="tags"
            placeholder={t("addresses.field.tags.placeholder", locale)}
          />
        </div>
        <div className="form-row">
          <label htmlFor="ownerPassengerId">
            {t("addresses.field.ownerPassengerId", locale)}
          </label>
          <input type="text" id="ownerPassengerId" name="ownerPassengerId" />
        </div>
        <div className="form-row">
          <label>
            <input type="checkbox" name="activeFlag" defaultChecked />{" "}
            {t("addresses.field.active", locale)}
          </label>
        </div>
        <button type="submit">{t("addresses.action.create", locale)}</button>
      </form>
    </div>
  );
}

function EditAddressForm({
  address,
  locale,
}: {
  address: TenantAddressRecord;
  locale: Locale;
}) {
  return (
    <div className="form-section">
      <h3>
        {t("addresses.edit.heading", locale, { name: address.addressName })}
      </h3>
      <form action={updateAddress} className="form-grid">
        <input type="hidden" name="addressId" value={address.addressId} />
        <div className="form-row">
          <label htmlFor="addressName">{t("addresses.field.name", locale)}</label>
          <input
            type="text"
            id="addressName"
            name="addressName"
            defaultValue={address.addressName}
            required
          />
        </div>
        <div className="form-row">
          <label htmlFor="addressText">{t("addresses.field.address", locale)}</label>
          <textarea
            id="addressText"
            name="addressText"
            defaultValue={address.addressText}
            required
            rows={3}
          />
        </div>
        <div className="form-row">
          <label htmlFor="lat">{t("addresses.field.latitude", locale)}</label>
          <input
            type="number"
            step="any"
            id="lat"
            name="lat"
            defaultValue={address.lat ?? ""}
          />
        </div>
        <div className="form-row">
          <label htmlFor="lng">{t("addresses.field.longitude", locale)}</label>
          <input
            type="number"
            step="any"
            id="lng"
            name="lng"
            defaultValue={address.lng ?? ""}
          />
        </div>
        <div className="form-row">
          <label htmlFor="tags">{t("addresses.field.tags", locale)}</label>
          <input
            type="text"
            id="tags"
            name="tags"
            defaultValue={address.tags.join(", ")}
            placeholder={t("addresses.field.tags.placeholder", locale)}
          />
        </div>
        <div className="form-row">
          <label htmlFor="ownerPassengerId">
            {t("addresses.field.ownerPassengerId", locale)}
          </label>
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
            {t("addresses.field.active", locale)}
          </label>
        </div>
        <div className="form-actions">
          <button type="submit">{t("addresses.action.save", locale)}</button>
          <Link href="/addresses">{t("addresses.action.cancel", locale)}</Link>
        </div>
      </form>
    </div>
  );
}

function AddressList({
  addresses,
  locale,
}: {
  addresses: TenantAddressRecord[];
  locale: Locale;
}) {
  return (
    <div className="data-table">
      {addresses.length === 0 ? (
        <p className="empty-state">{t("addresses.empty", locale)}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{t("addresses.column.name", locale)}</th>
              <th>{t("addresses.column.address", locale)}</th>
              <th>{t("addresses.column.tags", locale)}</th>
              <th>{t("addresses.column.lat", locale)}</th>
              <th>{t("addresses.column.lng", locale)}</th>
              <th>{t("addresses.column.status", locale)}</th>
              <th>{t("addresses.column.actions", locale)}</th>
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
                <td>
                  {a.activeFlag
                    ? t("addresses.status.active", locale)
                    : t("addresses.status.inactive", locale)}
                </td>
                <td>
                  <Link href={`/addresses?edit=${a.addressId}`}>
                    {t("addresses.action.edit", locale)}
                  </Link>
                  {" | "}
                  <form action={deleteAddress} style={{ display: "inline" }}>
                    <input type="hidden" name="addressId" value={a.addressId} />
                    <ConfirmSubmitButton
                      type="submit"
                      confirmMessage={t("addresses.confirm.delete", locale, {
                        name: a.addressName,
                      })}
                    >
                      {t("addresses.action.delete", locale)}
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
  const locale = await getServerLocale();
  const snapshot = await getTenantRoleSnapshot();
  requireCapability(
    snapshot.capabilities.canWriteTenant,
    t("addresses.error.writeAuthority", locale),
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
    const msg = e instanceof Error ? e.message : t("addresses.error.unknown", locale);
    redirect(`/addresses?error=${encodeURIComponent(msg)}`);
  }
}

async function updateAddress(formData: FormData) {
  "use server";
  const locale = await getServerLocale();
  const snapshot = await getTenantRoleSnapshot();
  requireCapability(
    snapshot.capabilities.canWriteTenant,
    t("addresses.error.writeAuthority", locale),
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
    const msg = e instanceof Error ? e.message : t("addresses.error.unknown", locale);
    redirect(
      `/addresses?edit=${command.addressId}&error=${encodeURIComponent(msg)}`,
    );
  }
}

async function deleteAddress(formData: FormData) {
  "use server";
  const locale = await getServerLocale();
  const snapshot = await getTenantRoleSnapshot();
  requireCapability(
    snapshot.capabilities.canWriteTenant,
    t("addresses.error.writeAuthority", locale),
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
    const msg = e instanceof Error ? e.message : t("addresses.error.unknown", locale);
    redirect(`/addresses?error=${encodeURIComponent(msg)}`);
  }
}
