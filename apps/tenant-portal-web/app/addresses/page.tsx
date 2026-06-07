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
import { formatPortalUiError, toPortalErrorMessage } from "@/lib/error-copy";

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
    error = formatPortalUiError(toPortalErrorMessage(e), "無法載入地址資料");
  }

  const editId = searchParams?.edit;
  const editingAddress = editId
    ? addresses.find((a) => a.addressId === editId)
    : null;

  const formError = searchParams?.error
    ? formatPortalUiError(searchParams.error, "地址作業失敗")
    : null;

  return (
    <main className="app-grid">
      <AppShellCard
        title="地址簿"
        description={`目前共有 ${addresses.length} 筆地址資料。`}
      >
        {error && (
          <div className="error-banner">
            <strong>載入地址資料失敗：</strong> {error}
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
          返回首頁
        </Link>
      </AppShellCard>
    </main>
  );
}

function NewAddressForm({ formError }: { formError: string | null }) {
  return (
    <div className="form-section">
      <h3>新增地址</h3>
      {formError && (
        <div className="error-banner">
          <strong>錯誤：</strong> {formError}
        </div>
      )}
      <form action={createAddress} className="form-grid">
        <div className="form-row">
          <label htmlFor="addressName">地址名稱 *</label>
          <input type="text" id="addressName" name="addressName" required />
        </div>
        <div className="form-row">
          <label htmlFor="addressText">地址內容 *</label>
          <textarea id="addressText" name="addressText" required rows={3} />
        </div>
        <div className="form-row">
          <label htmlFor="lat">緯度</label>
          <input type="number" step="any" id="lat" name="lat" />
        </div>
        <div className="form-row">
          <label htmlFor="lng">經度</label>
          <input type="number" step="any" id="lng" name="lng" />
        </div>
        <div className="form-row">
          <label htmlFor="tags">標籤（以逗號分隔）</label>
          <input
            type="text"
            id="tags"
            name="tags"
            placeholder="例如：辦公室、倉庫"
          />
        </div>
        <div className="form-row">
          <label htmlFor="ownerPassengerId">所屬乘客 ID</label>
          <input type="text" id="ownerPassengerId" name="ownerPassengerId" />
        </div>
        <div className="form-row">
          <label>
            <input type="checkbox" name="activeFlag" defaultChecked /> 啟用中
          </label>
        </div>
        <button type="submit">建立地址</button>
      </form>
    </div>
  );
}

function EditAddressForm({ address }: { address: TenantAddressRecord }) {
  return (
    <div className="form-section">
      <h3>編輯地址：{address.addressName}</h3>
      <form action={updateAddress} className="form-grid">
        <input type="hidden" name="addressId" value={address.addressId} />
        <div className="form-row">
          <label htmlFor="addressName">地址名稱 *</label>
          <input
            type="text"
            id="addressName"
            name="addressName"
            defaultValue={address.addressName}
            required
          />
        </div>
        <div className="form-row">
          <label htmlFor="addressText">地址內容 *</label>
          <textarea
            id="addressText"
            name="addressText"
            defaultValue={address.addressText}
            required
            rows={3}
          />
        </div>
        <div className="form-row">
          <label htmlFor="lat">緯度</label>
          <input
            type="number"
            step="any"
            id="lat"
            name="lat"
            defaultValue={address.lat ?? ""}
          />
        </div>
        <div className="form-row">
          <label htmlFor="lng">經度</label>
          <input
            type="number"
            step="any"
            id="lng"
            name="lng"
            defaultValue={address.lng ?? ""}
          />
        </div>
        <div className="form-row">
          <label htmlFor="tags">標籤（以逗號分隔）</label>
          <input
            type="text"
            id="tags"
            name="tags"
            defaultValue={address.tags.join(", ")}
            placeholder="例如：辦公室、倉庫"
          />
        </div>
        <div className="form-row">
          <label htmlFor="ownerPassengerId">所屬乘客 ID</label>
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
            啟用中
          </label>
        </div>
        <div className="form-actions">
          <button type="submit">儲存變更</button>
          <Link href="/addresses">取消</Link>
        </div>
      </form>
    </div>
  );
}

function AddressList({ addresses }: { addresses: TenantAddressRecord[] }) {
  return (
    <div className="data-table">
      {addresses.length === 0 ? (
        <p className="empty-state">目前沒有地址資料，可先建立一筆。</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>名稱</th>
              <th>地址</th>
              <th>標籤</th>
              <th>緯度</th>
              <th>經度</th>
              <th>狀態</th>
              <th>操作</th>
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
                <td>{a.activeFlag ? "啟用中" : "停用中"}</td>
                <td>
                  <Link href={`/addresses?edit=${a.addressId}`}>編輯</Link>
                  {" | "}
                  <form action={deleteAddress} style={{ display: "inline" }}>
                    <input type="hidden" name="addressId" value={a.addressId} />
                    <ConfirmSubmitButton
                      type="submit"
                      confirmMessage={`確定要刪除地址「${a.addressName}」嗎？`}
                    >
                      刪除
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
    "管理地址需要租戶寫入權限。",
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
    const msg = formatPortalUiError(toPortalErrorMessage(e), "無法建立地址");
    redirect(`/addresses?error=${encodeURIComponent(msg)}`);
  }
}

async function updateAddress(formData: FormData) {
  "use server";
  const snapshot = await getTenantRoleSnapshot();
  requireCapability(
    snapshot.capabilities.canWriteTenant,
    "管理地址需要租戶寫入權限。",
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
    const msg = formatPortalUiError(toPortalErrorMessage(e), "無法更新地址");
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
    "管理地址需要租戶寫入權限。",
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
    const msg = formatPortalUiError(toPortalErrorMessage(e), "無法刪除地址");
    redirect(`/addresses?error=${encodeURIComponent(msg)}`);
  }
}
