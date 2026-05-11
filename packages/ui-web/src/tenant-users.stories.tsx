import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  CalloutBanner,
  DataCellStack,
  DataTable,
  DataViewCard,
  KpiCard,
  KpiRow,
  PageHeader,
  StatusChip,
  Td,
  Tr,
} from "./index";
import { StoryChrome, TenantStoryShell } from "./tenant-story-support";

const splitCardGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: "16px",
};

function UsersBuiltView() {
  return (
    <TenantStoryShell currentPath="/users" breadcrumb="Users">
      <PageHeader
        eyebrow="People & roles"
        title="Users"
        subtitle="Tenant roster, invite state, and role catalog all stay grounded in the formal backend user and role records."
        meta={[
          { label: "Users", value: "4", tone: "tenant" },
          { label: "Roles", value: "4" },
          { label: "Pending", value: "0", tone: "success" },
        ]}
      />
      <KpiRow minWidth="170px">
        <KpiCard
          label="Users"
          value="4"
          detail="Published tenant user rows"
          tone="tenant"
        />
        <KpiCard
          label="Assignable roles"
          value="4"
          detail="Catalog entries marked assignable"
          tone="info"
        />
        <KpiCard
          label="Active"
          value="4"
          detail="All visible rows are active"
          tone="success"
        />
        <KpiCard
          label="Viewer seats"
          value="1"
          detail="Read-only access currently assigned"
          tone="neutral"
        />
      </KpiRow>
      <CalloutBanner
        title="Role lifecycle stays command-driven"
        description="The artboard shows an invite-first roster. The built view keeps that shape while avoiding unpublished mutations beyond the supported tenant user commands."
        tone="warning"
        density="compact"
      />
      <div style={splitCardGridStyle}>
        <DataViewCard
          title="Tenant user roster"
          subtitle="Roster-first layout aligned to the `TN_Users` artboard."
          tone="tenant"
          density="compact"
          summary="Display name, email, role, state, invite date, and update timestamp remain visible."
          footer="The UI keeps role display and role code visible together so the backend catalog remains the source of truth."
        >
          <DataTable
            density="compact"
            tone="tenant"
            columns={[
              { label: "Name", width: "180px" },
              { label: "Email", width: "220px" },
              { label: "Role", width: "150px" },
              { label: "State", width: "110px" },
              { label: "Role code", width: "160px" },
              { label: "Updated", width: "140px" },
            ]}
          >
            <Tr>
              <Td density="compact">
                <DataCellStack
                  primary={<strong>Acme Tenant Admin</strong>}
                  secondary="tenant-user-demo-001"
                />
              </Td>
              <Td density="compact">admin@acme.example</Td>
              <Td density="compact">
                <StatusChip tone="tenant" label="Tenant Admin" />
              </Td>
              <Td density="compact">
                <StatusChip tone="success" label="active" />
              </Td>
              <Td density="compact" mono>
                tenant_admin
              </Td>
              <Td density="compact" mono>
                2026-04-10 00:00
              </Td>
            </Tr>
            <Tr>
              <Td density="compact">
                <DataCellStack
                  primary={<strong>Acme Tenant Ops</strong>}
                  secondary="tenant-user-demo-002"
                />
              </Td>
              <Td density="compact">ops@acme.example</Td>
              <Td density="compact">
                <StatusChip tone="info" label="Tenant Ops Admin" />
              </Td>
              <Td density="compact">
                <StatusChip tone="success" label="active" />
              </Td>
              <Td density="compact" mono>
                tenant_ops_admin
              </Td>
              <Td density="compact" mono>
                2026-04-10 00:10
              </Td>
            </Tr>
            <Tr>
              <Td density="compact">
                <DataCellStack
                  primary={<strong>Acme Tenant Finance</strong>}
                  secondary="tenant-user-demo-003"
                />
              </Td>
              <Td density="compact">finance@acme.example</Td>
              <Td density="compact">
                <StatusChip tone="info" label="Tenant Finance Admin" />
              </Td>
              <Td density="compact">
                <StatusChip tone="success" label="active" />
              </Td>
              <Td density="compact" mono>
                tenant_finance_admin
              </Td>
              <Td density="compact" mono>
                2026-04-10 00:20
              </Td>
            </Tr>
            <Tr>
              <Td density="compact">
                <DataCellStack
                  primary={<strong>Acme Tenant Viewer</strong>}
                  secondary="tenant-user-demo-004"
                />
              </Td>
              <Td density="compact">viewer@acme.example</Td>
              <Td density="compact">
                <StatusChip tone="neutral" label="Tenant Viewer" />
              </Td>
              <Td density="compact">
                <StatusChip tone="success" label="active" />
              </Td>
              <Td density="compact" mono>
                tenant_viewer
              </Td>
              <Td density="compact" mono>
                2026-04-10 00:30
              </Td>
            </Tr>
          </DataTable>
        </DataViewCard>
        <DataViewCard
          title="Role catalog"
          subtitle="Backend role catalog stays explicit in the same screen."
          tone="tenant"
          density="compact"
          summary="4 assignable role definitions published for the tenant realm."
          footer="Product-spec families help with framing, but the role catalog still owns the canonical list."
        >
          <div style={{ display: "grid", gap: "10px" }}>
            <DataCellStack
              primary={<strong>Tenant Admin</strong>}
              secondary="Full tenant-administration access across booking, billing, reporting, webhook, and user management."
            />
            <DataCellStack
              primary={<strong>Tenant Ops Admin</strong>}
              secondary="Operational booking, passenger, address, and webhook management authority."
            />
            <DataCellStack
              primary={<strong>Tenant Finance Admin</strong>}
              secondary="Billing profile, invoice, export, and audit follow-up visibility."
            />
            <DataCellStack
              primary={<strong>Tenant Viewer</strong>}
              secondary="Read-only visibility without write or user-management authority."
            />
          </div>
        </DataViewCard>
      </div>
    </TenantStoryShell>
  );
}

const meta = {
  title: "Tenant Console/Users",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Side-by-side parity story for the `TN_Users` artboard. The Built panel mirrors the roster-first tenant access-management view, while the Canvas panel embeds `Tenant Console.html#users`.",
      },
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Users: Story = {
  render: () => (
    <StoryChrome
      heading="Tenant Users Parity Review"
      summary="Built implementation and the `TN_Users` artboard are rendered together for side-by-side review."
      built={<UsersBuiltView />}
      anchor="users"
    />
  ),
};
