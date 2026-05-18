import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  CalloutBanner,
  DataCellStack,
  DataTable,
  DataViewCard,
  DetailMetadataGrid,
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

function CostCentersBuiltView() {
  return (
    <TenantStoryShell currentPath="/cost-centers" breadcrumb="Cost centers">
      <PageHeader
        eyebrow="Cost centers"
        title="Cost center directory"
        subtitle="The built route stays read-only while combining the published directory, quota, coverage, and approval-rule views in one tenant governance lane."
        meta={[
          { label: "Directory rows", value: "4", tone: "tenant" },
          { label: "Unresolved samples", value: "2", tone: "warning" },
          { label: "Strict rules", value: "2", tone: "warning" },
        ]}
      />
      <KpiRow minWidth="170px">
        <KpiCard
          label="Active"
          value="3"
          detail="Published cost centers available for new bookings"
          tone="tenant"
        />
        <KpiCard
          label="Disabled"
          value="1"
          detail="Historical directory rows remain visible"
          tone="neutral"
        />
        <KpiCard
          label="Coverage"
          value="2"
          detail="Booking samples still need canonical mapping"
          tone="warning"
        />
        <KpiCard
          label="Approval"
          value="2"
          detail="Rules currently require approval or block"
          tone="warning"
        />
      </KpiRow>
      <CalloutBanner
        title="Read-only parity surface"
        description="This route intentionally avoids editor controls. It surfaces contract-backed directory, quota, coverage, and approval posture without inventing unpublished management mutations."
        tone="warning"
        density="compact"
      />
      <div style={splitCardGridStyle}>
        <DataViewCard
          title="Cost center directory"
          subtitle="Seven-column directory aligned to the `TN_CostCenter` artboard."
          tone="tenant"
          density="compact"
          summary="Code, name, owner, quota, used, approval posture, and state stay visible in one scan."
          footer="Secondary lines carry updated timestamps, inherited quota hints, and owner-linked approval cues."
        >
          <DataTable
            density="compact"
            tone="tenant"
            columns={[
              { label: "Code", width: "120px" },
              { label: "Name", width: "210px" },
              { label: "Owner", width: "160px" },
              { label: "Quota", width: "170px" },
              { label: "Used", width: "180px" },
              { label: "Approval", width: "170px" },
              { label: "State", width: "120px" },
            ]}
          >
            <Tr>
              <Td density="compact" mono>
                CC-FIN-04
              </Td>
              <Td density="compact">
                <DataCellStack
                  primary={<strong>Finance Ops</strong>}
                  secondary="Corporate riders and monthly finance export ownership."
                />
              </Td>
              <Td density="compact">
                <DataCellStack
                  primary="林怡安"
                  secondary="updated · 2026-05-14 03:05"
                />
              </Td>
              <Td density="compact">
                <DataCellStack
                  primary={<StatusChip tone="info" label="require_approval" />}
                  secondary="TWD 80,000 / month · inherited"
                />
              </Td>
              <Td density="compact">
                <DataCellStack
                  primary="TWD 61,200 used"
                  secondary="23% remaining · confirmed 31 / pending 4"
                />
              </Td>
              <Td density="compact">
                <DataCellStack
                  primary={
                    <StatusChip tone="warning" label="1 require approval" />
                  }
                  secondary="Owner-linked approver rule"
                />
              </Td>
              <Td density="compact">
                <StatusChip tone="success" label="active" />
              </Td>
            </Tr>
            <Tr>
              <Td density="compact" mono>
                CC-OPS-07
              </Td>
              <Td density="compact">
                <DataCellStack
                  primary={<strong>Airport Ops</strong>}
                  secondary="Reservation and escort-heavy dispatch group."
                />
              </Td>
              <Td density="compact">
                <DataCellStack
                  primary="王景程"
                  secondary="updated · 2026-05-14 02:58"
                />
              </Td>
              <Td density="compact">
                <DataCellStack
                  primary={<StatusChip tone="tenant" label="warn_only" />}
                  secondary="120 bookings / month"
                />
              </Td>
              <Td density="compact">
                <DataCellStack
                  primary="94 used"
                  secondary="26 remaining · confirmed 88 / pending 6"
                />
              </Td>
              <Td density="compact">
                <DataCellStack
                  primary={<StatusChip tone="info" label="1 active rule" />}
                  secondary="Tenant fallback escalation"
                />
              </Td>
              <Td density="compact">
                <StatusChip tone="success" label="active" />
              </Td>
            </Tr>
            <Tr>
              <Td density="compact" mono>
                CC-RD-12
              </Td>
              <Td density="compact">
                <DataCellStack
                  primary={<strong>R&amp;D Travel</strong>}
                  secondary="Prototype and site-visit budget lane."
                />
              </Td>
              <Td density="compact">
                <DataCellStack
                  primary="陳研之"
                  secondary="updated · 2026-05-13 21:20"
                />
              </Td>
              <Td density="compact">
                <DataCellStack
                  primary={<StatusChip tone="warning" label="hard_block" />}
                  secondary="TWD 25,000 / month"
                />
              </Td>
              <Td density="compact">
                <DataCellStack
                  primary="TWD 25,600 used"
                  secondary="0% remaining · confirmed 11 / pending 0"
                />
              </Td>
              <Td density="compact">
                <DataCellStack
                  primary={<StatusChip tone="warning" label="1 block rule" />}
                  secondary="Owner-linked approver rule"
                />
              </Td>
              <Td density="compact">
                <StatusChip tone="success" label="active" />
              </Td>
            </Tr>
            <Tr>
              <Td density="compact" mono>
                CC-LEG-01
              </Td>
              <Td density="compact">
                <DataCellStack
                  primary={<strong>Legacy Projects</strong>}
                  secondary="Historical bookings only."
                />
              </Td>
              <Td density="compact">
                <DataCellStack
                  primary="—"
                  secondary="updated · 2026-04-28 10:12"
                />
              </Td>
              <Td density="compact">
                <DataCellStack
                  primary={<StatusChip tone="neutral" label="—" />}
                  secondary="No active quota summary"
                />
              </Td>
              <Td density="compact">
                <DataCellStack
                  primary="—"
                  secondary="Quota record unavailable after disable"
                />
              </Td>
              <Td density="compact">
                <DataCellStack
                  primary={
                    <StatusChip tone="neutral" label="tenant fallback" />
                  }
                  secondary="No scoped owner rule"
                />
              </Td>
              <Td density="compact">
                <StatusChip tone="neutral" label="disabled" />
              </Td>
            </Tr>
          </DataTable>
        </DataViewCard>
        <DataViewCard
          title="Coverage and approval snapshot"
          subtitle="The route surfaces helper signals that the original artboard implied but did not ground in backend vocabulary."
          tone="tenant"
          density="compact"
          summary="Coverage helper and active-rule counts sit alongside the table so tenant admins can audit mapping and approval posture without switching surfaces."
          footer="Unresolved booking samples remain read-only evidence; repair still belongs to canonical tenant cost-center commands."
        >
          <DetailMetadataGrid
            dense
            minColumnWidth="180px"
            items={[
              { id: "bookings", label: "Total bookings", value: "542" },
              { id: "resolved", label: "Resolved coverage", value: "540" },
              { id: "unresolved", label: "Unresolved samples", value: "2" },
              { id: "disabled", label: "Disabled hits", value: "3" },
              { id: "rules", label: "Active rules", value: "5" },
              { id: "strict", label: "Strict rules", value: "2" },
            ]}
          />
          <div style={{ display: "grid", gap: "10px", marginTop: "12px" }}>
            <DataCellStack
              primary={<strong>FIN-OPS</strong>}
              secondary="2 booking hits · suggestion CC-FIN-04"
            />
            <DataCellStack
              primary={<strong>RD-LAB</strong>}
              secondary="1 booking hit · suggestion CC-RD-12"
            />
          </div>
        </DataViewCard>
      </div>
    </TenantStoryShell>
  );
}

const meta = {
  title: "Tenant Console/Cost Centers",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Side-by-side parity story for the `TN_CostCenter` artboard. The Built panel mirrors the read-only directory-plus-governance route, while the Canvas panel embeds `Tenant Console.html#costcenter` for review.",
      },
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const CostCenters: Story = {
  render: () => (
    <StoryChrome
      heading="Tenant Cost Centers Parity Review"
      summary="Built implementation and the `TN_CostCenter` artboard are rendered together for side-by-side review."
      built={<CostCentersBuiltView />}
      anchor="costcenter"
    />
  ),
};
