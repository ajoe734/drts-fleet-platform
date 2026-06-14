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
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import type { Locale } from "@/lib/translations";

export default async function PassengersPage({
  searchParams,
}: {
  searchParams?: { edit?: string; error?: string };
}) {
  const locale = await getServerLocale();
  const client = await getTenantClient();

  let passengers: TenantPassengerRecord[] = [];
  let error: string | null = null;

  try {
    passengers = await client.listPassengers();
  } catch (e) {
    error = e instanceof Error ? e.message : t("passengers.error.unknown", locale);
  }

  const editId = searchParams?.edit;
  const editingPassenger = editId
    ? passengers.find((p) => p.passengerId === editId)
    : null;

  const formError = searchParams?.error ?? null;

  return (
    <main className="app-grid">
      <AppShellCard
        title={t("passengers.title", locale)}
        description={t("passengers.count", locale, { count: passengers.length })}
      >
        {error && (
          <div className="error-banner">
            <strong>{t("passengers.error.loading", locale)}</strong> {error}
          </div>
        )}

        {editingPassenger ? (
          <EditPassengerForm passenger={editingPassenger} locale={locale} />
        ) : (
          <>
            <NewPassengerForm formError={formError} locale={locale} />
            <PassengerList passengers={passengers} locale={locale} />
          </>
        )}

        <Link className="route-link" href="/">
          {t("passengers.backToHome", locale)}
        </Link>
      </AppShellCard>
    </main>
  );
}

function NewPassengerForm({
  formError,
  locale,
}: {
  formError: string | null;
  locale: Locale;
}) {
  return (
    <div className="form-section">
      <h3>{t("passengers.new.heading", locale)}</h3>
      {formError && (
        <div className="error-banner">
          <strong>{t("passengers.error.label", locale)}</strong> {formError}
        </div>
      )}
      <form action={createPassenger} className="form-grid">
        <div className="form-row">
          <label htmlFor="fullName">{t("passengers.field.fullName", locale)}</label>
          <input type="text" id="fullName" name="fullName" required />
        </div>
        <div className="form-row">
          <label htmlFor="employeeNo">{t("passengers.field.employeeNo", locale)}</label>
          <input type="text" id="employeeNo" name="employeeNo" />
        </div>
        <div className="form-row">
          <label htmlFor="departmentName">{t("passengers.field.department", locale)}</label>
          <input type="text" id="departmentName" name="departmentName" />
        </div>
        <div className="form-row">
          <label htmlFor="mobile">{t("passengers.field.mobile", locale)}</label>
          <input type="tel" id="mobile" name="mobile" />
        </div>
        <div className="form-row">
          <label htmlFor="email">{t("passengers.field.email", locale)}</label>
          <input type="email" id="email" name="email" />
        </div>
        <div className="form-row">
          <label>
            <input type="checkbox" name="activeFlag" defaultChecked />{" "}
            {t("passengers.field.active", locale)}
          </label>
        </div>
        <button type="submit">{t("passengers.action.create", locale)}</button>
      </form>
    </div>
  );
}

function EditPassengerForm({
  passenger,
  locale,
}: {
  passenger: TenantPassengerRecord;
  locale: Locale;
}) {
  return (
    <div className="form-section">
      <h3>
        {t("passengers.edit.heading", locale, { name: passenger.fullName })}
      </h3>
      <form action={updatePassenger} className="form-grid">
        <input type="hidden" name="passengerId" value={passenger.passengerId} />
        <div className="form-row">
          <label htmlFor="fullName">{t("passengers.field.fullName", locale)}</label>
          <input
            type="text"
            id="fullName"
            name="fullName"
            defaultValue={passenger.fullName}
            required
          />
        </div>
        <div className="form-row">
          <label htmlFor="employeeNo">{t("passengers.field.employeeNo", locale)}</label>
          <input
            type="text"
            id="employeeNo"
            name="employeeNo"
            defaultValue={passenger.employeeNo ?? ""}
          />
        </div>
        <div className="form-row">
          <label htmlFor="departmentName">{t("passengers.field.department", locale)}</label>
          <input
            type="text"
            id="departmentName"
            name="departmentName"
            defaultValue={passenger.departmentName ?? ""}
          />
        </div>
        <div className="form-row">
          <label htmlFor="mobile">{t("passengers.field.mobile", locale)}</label>
          <input
            type="tel"
            id="mobile"
            name="mobile"
            defaultValue={passenger.mobile ?? ""}
          />
        </div>
        <div className="form-row">
          <label htmlFor="email">{t("passengers.field.email", locale)}</label>
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
            {t("passengers.field.active", locale)}
          </label>
        </div>
        <div className="form-actions">
          <button type="submit">{t("passengers.action.save", locale)}</button>
          <Link href="/passengers">{t("passengers.action.cancel", locale)}</Link>
        </div>
      </form>
    </div>
  );
}

function PassengerList({
  passengers,
  locale,
}: {
  passengers: TenantPassengerRecord[];
  locale: Locale;
}) {
  return (
    <div className="data-table">
      {passengers.length === 0 ? (
        <p className="empty-state">{t("passengers.empty", locale)}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{t("passengers.column.name", locale)}</th>
              <th>{t("passengers.column.employeeNo", locale)}</th>
              <th>{t("passengers.column.department", locale)}</th>
              <th>{t("passengers.column.mobile", locale)}</th>
              <th>{t("passengers.column.email", locale)}</th>
              <th>{t("passengers.column.status", locale)}</th>
              <th>{t("passengers.column.actions", locale)}</th>
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
                <td>
                  {p.activeFlag
                    ? t("passengers.status.active", locale)
                    : t("passengers.status.inactive", locale)}
                </td>
                <td>
                  <Link href={`/passengers?edit=${p.passengerId}`}>
                    {t("passengers.action.edit", locale)}
                  </Link>
                  {" | "}
                  <form action={deletePassenger} style={{ display: "inline" }}>
                    <input
                      type="hidden"
                      name="passengerId"
                      value={p.passengerId}
                    />
                    <ConfirmSubmitButton
                      type="submit"
                      confirmMessage={t("passengers.confirm.delete", locale, {
                        name: p.fullName,
                      })}
                    >
                      {t("passengers.action.delete", locale)}
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
  const locale = await getServerLocale();
  const snapshot = await getTenantRoleSnapshot();
  requireCapability(
    snapshot.capabilities.canWriteTenant,
    t("passengers.error.writeAuthority", locale),
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
    const msg = e instanceof Error ? e.message : t("passengers.error.unknown", locale);
    redirect(`/passengers?error=${encodeURIComponent(msg)}`);
  }
}

async function updatePassenger(formData: FormData) {
  "use server";
  const locale = await getServerLocale();
  const snapshot = await getTenantRoleSnapshot();
  requireCapability(
    snapshot.capabilities.canWriteTenant,
    t("passengers.error.writeAuthority", locale),
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
    const msg = e instanceof Error ? e.message : t("passengers.error.unknown", locale);
    redirect(
      `/passengers?edit=${command.passengerId}&error=${encodeURIComponent(msg)}`,
    );
  }
}

async function deletePassenger(formData: FormData) {
  "use server";
  const locale = await getServerLocale();
  const snapshot = await getTenantRoleSnapshot();
  requireCapability(
    snapshot.capabilities.canWriteTenant,
    t("passengers.error.writeAuthority", locale),
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
    const msg = e instanceof Error ? e.message : t("passengers.error.unknown", locale);
    redirect(`/passengers?error=${encodeURIComponent(msg)}`);
  }
}
