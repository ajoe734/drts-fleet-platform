import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type {
  TenantPassengerRecord,
  UpsertTenantPassengerCommand,
} from "@drts/contracts";
import { AppShellCard } from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";
import { getTenantRoleSnapshot, requireCapability } from "@/lib/rbac";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { formatPortalUiError, toPortalErrorMessage } from "@/lib/error-copy";

export default async function PassengersPage({
  searchParams,
}: {
  searchParams?: { edit?: string; error?: string };
}) {
  const client = await getTenantClient();

  let passengers: TenantPassengerRecord[] = [];
  let error: string | null = null;

  try {
    passengers = await client.listPassengers();
  } catch (e) {
    error = formatPortalUiError(toPortalErrorMessage(e), "無法載入乘客資料");
  }

  const editId = searchParams?.edit;
  const editingPassenger = editId
    ? passengers.find((p) => p.passengerId === editId)
    : null;

  const formError = searchParams?.error
    ? formatPortalUiError(searchParams.error, "乘客作業失敗")
    : null;

  return (
    <main className="app-grid">
      <AppShellCard
        title="乘客名冊"
        description={`目前共有 ${passengers.length} 筆乘客資料。`}
      >
        {error && (
          <div className="error-banner">
            <strong>載入乘客資料失敗：</strong> {error}
          </div>
        )}

        {editingPassenger ? (
          <EditPassengerForm passenger={editingPassenger} />
        ) : (
          <>
            <NewPassengerForm formError={formError} />
            <PassengerList passengers={passengers} />
          </>
        )}

        <Link className="route-link" href="/">
          返回首頁
        </Link>
      </AppShellCard>
    </main>
  );
}

function NewPassengerForm({ formError }: { formError: string | null }) {
  return (
    <div className="form-section">
      <h3>新增乘客</h3>
      {formError && (
        <div className="error-banner">
          <strong>錯誤：</strong> {formError}
        </div>
      )}
      <form action={createPassenger} className="form-grid">
        <div className="form-row">
          <label htmlFor="fullName">姓名 *</label>
          <input type="text" id="fullName" name="fullName" required />
        </div>
        <div className="form-row">
          <label htmlFor="employeeNo">工號</label>
          <input type="text" id="employeeNo" name="employeeNo" />
        </div>
        <div className="form-row">
          <label htmlFor="departmentName">部門</label>
          <input type="text" id="departmentName" name="departmentName" />
        </div>
        <div className="form-row">
          <label htmlFor="mobile">手機</label>
          <input type="tel" id="mobile" name="mobile" />
        </div>
        <div className="form-row">
          <label htmlFor="email">電子郵件</label>
          <input type="email" id="email" name="email" />
        </div>
        <div className="form-row">
          <label>
            <input type="checkbox" name="activeFlag" defaultChecked /> 啟用中
          </label>
        </div>
        <button type="submit">建立乘客</button>
      </form>
    </div>
  );
}

function EditPassengerForm({
  passenger,
}: {
  passenger: TenantPassengerRecord;
}) {
  return (
    <div className="form-section">
      <h3>編輯乘客：{passenger.fullName}</h3>
      <form action={updatePassenger} className="form-grid">
        <input type="hidden" name="passengerId" value={passenger.passengerId} />
        <div className="form-row">
          <label htmlFor="fullName">姓名 *</label>
          <input
            type="text"
            id="fullName"
            name="fullName"
            defaultValue={passenger.fullName}
            required
          />
        </div>
        <div className="form-row">
          <label htmlFor="employeeNo">工號</label>
          <input
            type="text"
            id="employeeNo"
            name="employeeNo"
            defaultValue={passenger.employeeNo ?? ""}
          />
        </div>
        <div className="form-row">
          <label htmlFor="departmentName">部門</label>
          <input
            type="text"
            id="departmentName"
            name="departmentName"
            defaultValue={passenger.departmentName ?? ""}
          />
        </div>
        <div className="form-row">
          <label htmlFor="mobile">手機</label>
          <input
            type="tel"
            id="mobile"
            name="mobile"
            defaultValue={passenger.mobile ?? ""}
          />
        </div>
        <div className="form-row">
          <label htmlFor="email">電子郵件</label>
          <input
            type="email"
            id="email"
            name="email"
            defaultValue={passenger.email ?? ""}
          />
        </div>
        <div className="form-row">
          <label>
            <input
              type="checkbox"
              name="activeFlag"
              defaultChecked={passenger.activeFlag}
            />{" "}
            啟用中
          </label>
        </div>
        <div className="form-actions">
          <button type="submit">儲存變更</button>
          <Link href="/passengers">取消</Link>
        </div>
      </form>
    </div>
  );
}

function PassengerList({
  passengers,
}: {
  passengers: TenantPassengerRecord[];
}) {
  return (
    <div className="data-table">
      {passengers.length === 0 ? (
        <p className="empty-state">目前沒有乘客資料，可先建立一筆。</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>姓名</th>
              <th>工號</th>
              <th>部門</th>
              <th>手機</th>
              <th>電子郵件</th>
              <th>狀態</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {passengers.map((p) => (
              <tr key={p.passengerId}>
                <td>{p.fullName}</td>
                <td>{p.employeeNo ?? "-"}</td>
                <td>{p.departmentName ?? "-"}</td>
                <td>{p.mobile ?? "-"}</td>
                <td>{p.email ?? "-"}</td>
                <td>{p.activeFlag ? "啟用中" : "停用中"}</td>
                <td>
                  <Link href={`/passengers?edit=${p.passengerId}`}>編輯</Link>
                  {" | "}
                  <form action={deletePassenger} style={{ display: "inline" }}>
                    <input
                      type="hidden"
                      name="passengerId"
                      value={p.passengerId}
                    />
                    <ConfirmSubmitButton
                      type="submit"
                      confirmMessage={`確定要刪除乘客「${p.fullName}」嗎？`}
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

async function createPassenger(formData: FormData) {
  "use server";
  const snapshot = await getTenantRoleSnapshot();
  requireCapability(
    snapshot.capabilities.canWriteTenant,
    "管理乘客需要租戶寫入權限。",
  );
  const client = await getTenantClient();

  const command: UpsertTenantPassengerCommand = {
    fullName: formData.get("fullName") as string,
    employeeNo: (formData.get("employeeNo") as string) || null,
    departmentName: (formData.get("departmentName") as string) || null,
    mobile: (formData.get("mobile") as string) || null,
    email: (formData.get("email") as string) || null,
    activeFlag: formData.get("activeFlag") !== null,
  };

  try {
    await client.upsertPassenger(command);
    revalidatePath("/passengers");
  } catch (e) {
    const msg = formatPortalUiError(toPortalErrorMessage(e), "無法建立乘客");
    redirect(`/passengers?error=${encodeURIComponent(msg)}`);
  }
}

async function updatePassenger(formData: FormData) {
  "use server";
  const snapshot = await getTenantRoleSnapshot();
  requireCapability(
    snapshot.capabilities.canWriteTenant,
    "管理乘客需要租戶寫入權限。",
  );
  const client = await getTenantClient();

  const command: UpsertTenantPassengerCommand = {
    passengerId: formData.get("passengerId") as string,
    fullName: formData.get("fullName") as string,
    employeeNo: (formData.get("employeeNo") as string) || null,
    departmentName: (formData.get("departmentName") as string) || null,
    mobile: (formData.get("mobile") as string) || null,
    email: (formData.get("email") as string) || null,
    activeFlag: formData.get("activeFlag") !== null,
  };

  try {
    await client.upsertPassenger(command);
    revalidatePath("/passengers");
  } catch (e) {
    const msg = formatPortalUiError(toPortalErrorMessage(e), "無法更新乘客");
    redirect(
      `/passengers?edit=${command.passengerId}&error=${encodeURIComponent(msg)}`,
    );
  }
}

async function deletePassenger(formData: FormData) {
  "use server";
  const snapshot = await getTenantRoleSnapshot();
  requireCapability(
    snapshot.capabilities.canWriteTenant,
    "管理乘客需要租戶寫入權限。",
  );
  const client = await getTenantClient();

  const passengerId = formData.get("passengerId") as string;

  // API uses upsert with activeFlag=false to soft-delete
  const command: UpsertTenantPassengerCommand = {
    passengerId,
    fullName: "DELETED",
    activeFlag: false,
  };

  try {
    await client.upsertPassenger(command);
    revalidatePath("/passengers");
  } catch (e) {
    const msg = formatPortalUiError(toPortalErrorMessage(e), "無法刪除乘客");
    redirect(`/passengers?error=${encodeURIComponent(msg)}`);
  }
}
