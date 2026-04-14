import Link from "next/link";
import { revalidatePath } from "next/cache";
import type {
  TenantPassengerRecord,
  UpsertTenantPassengerCommand,
} from "@drts/contracts";
import { AppShellCard } from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";

export default async function PassengersPage({
  searchParams,
}: {
  searchParams?: { edit?: string; error?: string };
}) {
  const client = getTenantClient();

  let passengers: TenantPassengerRecord[] = [];
  let error: string | null = null;

  try {
    passengers = await client.listPassengers();
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  const editId = searchParams?.edit;
  const editingPassenger = editId
    ? passengers.find((p) => p.passengerId === editId)
    : null;

  const formError = searchParams?.error ?? null;

  return (
    <main className="app-grid">
      <AppShellCard
        title="Passengers"
        description={`${passengers.length} passenger(s) found.`}
      >
        {error && (
          <div className="error-banner">
            <strong>Error loading passengers:</strong> {error}
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
          Back to home
        </Link>
      </AppShellCard>
    </main>
  );
}

function NewPassengerForm({ formError }: { formError: string | null }) {
  return (
    <div className="form-section">
      <h3>New Passenger</h3>
      {formError && (
        <div className="error-banner">
          <strong>Error:</strong> {formError}
        </div>
      )}
      <form action={createPassenger} className="form-grid">
        <div className="form-row">
          <label htmlFor="fullName">Full Name *</label>
          <input type="text" id="fullName" name="fullName" required />
        </div>
        <div className="form-row">
          <label htmlFor="employeeNo">Employee No</label>
          <input type="text" id="employeeNo" name="employeeNo" />
        </div>
        <div className="form-row">
          <label htmlFor="departmentName">Department</label>
          <input type="text" id="departmentName" name="departmentName" />
        </div>
        <div className="form-row">
          <label htmlFor="mobile">Mobile</label>
          <input type="tel" id="mobile" name="mobile" />
        </div>
        <div className="form-row">
          <label htmlFor="email">Email</label>
          <input type="email" id="email" name="email" />
        </div>
        <div className="form-row">
          <label>
            <input type="checkbox" name="activeFlag" defaultChecked /> Active
          </label>
        </div>
        <button type="submit">Create Passenger</button>
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
      <h3>Edit Passenger: {passenger.fullName}</h3>
      <form action={updatePassenger} className="form-grid">
        <input type="hidden" name="passengerId" value={passenger.passengerId} />
        <div className="form-row">
          <label htmlFor="fullName">Full Name *</label>
          <input
            type="text"
            id="fullName"
            name="fullName"
            defaultValue={passenger.fullName}
            required
          />
        </div>
        <div className="form-row">
          <label htmlFor="employeeNo">Employee No</label>
          <input
            type="text"
            id="employeeNo"
            name="employeeNo"
            defaultValue={passenger.employeeNo ?? ""}
          />
        </div>
        <div className="form-row">
          <label htmlFor="departmentName">Department</label>
          <input
            type="text"
            id="departmentName"
            name="departmentName"
            defaultValue={passenger.departmentName ?? ""}
          />
        </div>
        <div className="form-row">
          <label htmlFor="mobile">Mobile</label>
          <input
            type="tel"
            id="mobile"
            name="mobile"
            defaultValue={passenger.mobile ?? ""}
          />
        </div>
        <div className="form-row">
          <label htmlFor="email">Email</label>
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
            Active
          </label>
        </div>
        <div className="form-actions">
          <button type="submit">Save Changes</button>
          <Link href="/passengers">Cancel</Link>
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
        <p className="empty-state">No passengers found. Create one above.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Employee No</th>
              <th>Department</th>
              <th>Mobile</th>
              <th>Email</th>
              <th>Status</th>
              <th>Actions</th>
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
                <td>{p.activeFlag ? "Active" : "Inactive"}</td>
                <td>
                  <Link href={`/passengers?edit=${p.passengerId}`}>Edit</Link>
                  {" | "}
                  <form action={deletePassenger} style={{ display: "inline" }}>
                    <input
                      type="hidden"
                      name="passengerId"
                      value={p.passengerId}
                    />
                    <button
                      type="submit"
                      onClick={(e) => {
                        if (!confirm(`Delete passenger "${p.fullName}"?`)) {
                          e.preventDefault();
                        }
                      }}
                    >
                      Delete
                    </button>
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
  const client = getTenantClient();

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
    const msg = e instanceof Error ? e.message : "Unknown error";
    redirect(`/passengers?error=${encodeURIComponent(msg)}`);
  }
}

async function updatePassenger(formData: FormData) {
  "use server";
  const client = getTenantClient();

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
    const msg = e instanceof Error ? e.message : "Unknown error";
    redirect(
      `/passengers?edit=${command.passengerId}&error=${encodeURIComponent(msg)}`,
    );
  }
}

async function deletePassenger(formData: FormData) {
  "use server";
  const client = getTenantClient();

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
    const msg = e instanceof Error ? e.message : "Unknown error";
    redirect(`/passengers?error=${encodeURIComponent(msg)}`);
  }
}

function redirect(path: string) {
  // Dynamic import to avoid bundling in client code
  import("next/navigation").then(({ redirect }) => redirect(path));
}
